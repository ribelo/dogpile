import { Effect } from "effect"
import { FetchHttpClient } from "@effect/platform"
import { drizzle } from "drizzle-orm/d1"
import { dogs, shelters, syncLogs } from "@dogpile/db"
import { getAdapter } from "@dogpile/scrapers"
import { eq } from "drizzle-orm"

interface Env {
  DB: D1Database
  KV: KVNamespace
  PHOTOS_ORIGINAL: R2Bucket
  REINDEX_QUEUE: Queue<ReindexJob>
}

interface ScrapeJob {
  shelterId: string
  shelterSlug: string
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
        const adapter = getAdapter(job.shelterSlug)

        if (!adapter) {
          yield* Effect.logError(`Unknown scraper: ${job.shelterSlug}`)
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

        // Get existing dogs by fingerprint
        const existingDogs = yield* Effect.tryPromise({
          try: () =>
            db
              .select({ fingerprint: dogs.fingerprint, id: dogs.id })
              .from(dogs)
              .where(eq(dogs.shelterId, job.shelterId))
              .all(),
          catch: (e) => new Error(`Failed to fetch existing dogs: ${e}`),
        })

        const existingByFingerprint = new Map(existingDogs.map((d) => [d.fingerprint, d]))
        const scrapedFingerprints = new Set(rawDogs.map((d) => d.fingerprint))

        let added = 0
        let updated = 0
        let removed = 0
        const reindexJobs: ReindexJob[] = []
        const now = new Date()

        for (const raw of rawDogs) {
          const dog = yield* adapter.transform(raw, config)
          const existing = existingByFingerprint.get(raw.fingerprint)

          if (!existing) {
            // New dog
            const id = crypto.randomUUID()
            yield* Effect.tryPromise({
              try: () =>
                db.insert(dogs).values({
                  id,
                  shelterId: dog.shelterId,
                  externalId: dog.externalId,
                  fingerprint: dog.fingerprint,
                  rawDescription: dog.rawDescription,
                  name: dog.name,
                  sex: dog.sex as "male" | "female" | "unknown" | null | undefined,
                  description: dog.description,
                  locationName: dog.locationName,
                  locationCity: dog.locationCity,
                  locationLat: dog.locationLat,
                  locationLng: dog.locationLng,
                  isFoster: dog.isFoster,
                  breedEstimates: dog.breedEstimates ? [...dog.breedEstimates] : [],
                  sizeEstimate: dog.sizeEstimate,
                  ageEstimate: dog.ageEstimate,
                  weightEstimate: dog.weightEstimate,
                  personalityTags: dog.personalityTags ? [...dog.personalityTags] : [],
                  vaccinated: dog.vaccinated,
                  sterilized: dog.sterilized,
                  chipped: dog.chipped,
                  goodWithKids: dog.goodWithKids,
                  goodWithDogs: dog.goodWithDogs,
                  goodWithCats: dog.goodWithCats,
                  furLength: dog.furLength as "short" | "medium" | "long" | null | undefined,
                  furType: dog.furType as "smooth" | "wire" | "curly" | "double" | null | undefined,
                  colorPrimary: dog.colorPrimary,
                  colorSecondary: dog.colorSecondary,
                  colorPattern: dog.colorPattern as "solid" | "spotted" | "brindle" | "merle" | "bicolor" | "tricolor" | "sable" | "tuxedo" | null | undefined,
                  earType: dog.earType as "floppy" | "erect" | "semi" | null | undefined,
                  tailType: dog.tailType as "long" | "short" | "docked" | "curled" | null | undefined,
                  photos: dog.photos ? [...dog.photos] : [],
                  photosGenerated: dog.photosGenerated ? [...dog.photosGenerated] : [],
                  sourceUrl: dog.sourceUrl,
                  urgent: dog.urgent ?? false,
                  status: "available",
                  lastSeenAt: now,
                  createdAt: now,
                  updatedAt: now,
                }),
              catch: (e) => new Error(`Failed to insert dog: ${e}`),
            })
            reindexJobs.push({ type: "upsert", dogId: id, description: dog.description ?? undefined })
            added++
          } else {
            // Existing dog - just update lastSeenAt (fingerprint matched = no changes)
            yield* Effect.tryPromise({
              try: () =>
                db
                  .update(dogs)
                  .set({ lastSeenAt: now })
                  .where(eq(dogs.id, existing.id)),
              catch: (e) => new Error(`Failed to update lastSeenAt: ${e}`),
            })
          }
        }

        // Mark dogs not seen in this scrape as removed
        for (const existing of existingDogs) {
          if (!scrapedFingerprints.has(existing.fingerprint)) {
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
