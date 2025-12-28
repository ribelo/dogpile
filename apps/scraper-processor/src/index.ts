import { Effect } from "effect"
import { FetchHttpClient } from "@effect/platform"
import { drizzle } from "drizzle-orm/d1"
import { dogs, shelters, syncLogs } from "@dogpile/db"
import { getAdapter } from "@dogpile/scrapers"
import { eq } from "drizzle-orm"
import { createHash } from "./utils/hash.js"

interface Env {
  DB: D1Database
  KV: KVNamespace
  IMAGES: R2Bucket
  REINDEX_QUEUE: Queue<ReindexJob>
}

interface ScrapeJob {
  shelterId: string
  scraperId: string
  baseUrl: string
}

interface ReindexJob {
  type: "upsert" | "delete"
  dogId: string
  description?: string
}

export default {
  async queue(
    batch: MessageBatch<ScrapeJob>,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    for (const message of batch.messages) {
      const job = message.body

      const program = Effect.gen(function* () {
        const db = drizzle(env.DB)
        const adapter = getAdapter(job.scraperId)

        if (!adapter) {
          yield* Effect.logError(`Unknown scraper: ${job.scraperId}`)
          message.ack()
          return
        }

        const syncLogId = crypto.randomUUID()
        const startedAt = new Date()

        yield* Effect.tryPromise({
          try: () =>
            db.insert(syncLogs).values({
              id: syncLogId,
              shelterId: job.shelterId,
              startedAt,
              dogsAdded: 0,
              dogsUpdated: 0,
              dogsRemoved: 0,
              errors: [],
            }),
          catch: (e) => new Error(`Failed to create sync log: ${e}`),
        })

        const config = {
          shelterId: job.shelterId,
          baseUrl: job.baseUrl,
        }

        const html = yield* adapter.fetch(config)
        const rawDogs = yield* adapter.parse(html, config)

        const existingDogs = yield* Effect.tryPromise({
          try: () =>
            db
              .select({ externalId: dogs.externalId, id: dogs.id, checksum: dogs.checksum })
              .from(dogs)
              .where(eq(dogs.shelterId, job.shelterId))
              .all(),
          catch: (e) => new Error(`Failed to fetch existing dogs: ${e}`),
        })

        const existingMap = new Map(existingDogs.map((d) => [d.externalId, d]))
        const scrapedIds = new Set(rawDogs.map((d) => d.externalId))

        let added = 0
        let updated = 0
        let removed = 0
        const reindexJobs: ReindexJob[] = []

        for (const raw of rawDogs) {
          const dog = yield* adapter.transform(raw, config)
          const checksum = createHash(dog)
          const existing = existingMap.get(raw.externalId)

          if (!existing) {
            const id = crypto.randomUUID()
            const now = new Date()
            yield* Effect.tryPromise({
              try: () =>
                db.insert(dogs).values({
                  id,
                  shelterId: dog.shelterId,
                  externalId: dog.externalId,
                  name: dog.name,
                  breed: dog.breed,
                  ageMonths: dog.ageMonths,
                  size: dog.size,
                  sex: dog.sex,
                  description: dog.description,
                  personalityTags: [...dog.personalityTags],
                  photos: [...dog.photos],
                  urgent: dog.urgent,
                  status: "available",
                  checksum,
                  createdAt: now,
                  updatedAt: now,
                }),
              catch: (e) => new Error(`Failed to insert dog: ${e}`),
            })
            reindexJobs.push({ type: "upsert", dogId: id, description: dog.description ?? undefined })
            added++
          } else if (existing.checksum !== checksum) {
            yield* Effect.tryPromise({
              try: () =>
                db
                  .update(dogs)
                  .set({
                    name: dog.name,
                    breed: dog.breed,
                    ageMonths: dog.ageMonths,
                    size: dog.size,
                    sex: dog.sex,
                    description: dog.description,
                    personalityTags: [...dog.personalityTags],
                    photos: [...dog.photos],
                    urgent: dog.urgent,
                    checksum,
                    updatedAt: new Date(),
                  })
                  .where(eq(dogs.id, existing.id)),
              catch: (e) => new Error(`Failed to update dog: ${e}`),
            })
            reindexJobs.push({ type: "upsert", dogId: existing.id, description: dog.description ?? undefined })
            updated++
          }
        }

        for (const existing of existingDogs) {
          if (!scrapedIds.has(existing.externalId)) {
            yield* Effect.tryPromise({
              try: () =>
                db.update(dogs).set({ status: "removed" }).where(eq(dogs.id, existing.id)),
              catch: (e) => new Error(`Failed to mark dog removed: ${e}`),
            })
            reindexJobs.push({ type: "delete", dogId: existing.id })
            removed++
          }
        }

        if (reindexJobs.length > 0) {
          yield* Effect.tryPromise({
            try: () =>
              env.REINDEX_QUEUE.sendBatch(reindexJobs.map((job) => ({ body: job }))),
            catch: (e) => new Error(`Failed to enqueue reindex jobs: ${e}`),
          })
        }

        yield* Effect.tryPromise({
          try: () =>
            db
              .update(syncLogs)
              .set({
                finishedAt: new Date(),
                dogsAdded: added,
                dogsUpdated: updated,
                dogsRemoved: removed,
              })
              .where(eq(syncLogs.id, syncLogId)),
          catch: (e) => new Error(`Failed to update sync log: ${e}`),
        })

        yield* Effect.tryPromise({
          try: () =>
            db
              .update(shelters)
              .set({ lastSync: new Date(), status: "active" })
              .where(eq(shelters.id, job.shelterId)),
          catch: (e) => new Error(`Failed to update shelter: ${e}`),
        })

        yield* Effect.logInfo(
          `Sync complete for ${job.shelterId}: +${added} ~${updated} -${removed}`
        )

        message.ack()
      }).pipe(
        Effect.provide(FetchHttpClient.layer),
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logError(`Scrape failed: ${error}`)
            message.retry()
          })
        )
      )

      ctx.waitUntil(Effect.runPromise(program))
    }
  },
}
