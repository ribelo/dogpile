import { Effect, Layer, Option } from "effect"
import { FetchHttpClient } from "@effect/platform"
import { drizzle } from "drizzle-orm/d1"
import { dogs, shelters, syncLogs } from "@dogpile/db"
import { getAdapter } from "@dogpile/scrapers"
import { eq } from "drizzle-orm"
import {
  TextExtractor,
  TextExtractorLive,
  PhotoAnalyzer,
  PhotoAnalyzerLive,
  DescriptionGenerator,
  DescriptionGeneratorLive,
  OpenRouterClientLive,
} from "@dogpile/core/services"
import { handleImageJobs, type ImageJob, type ImagesBinding } from "./image-handler.js"

interface Env {
  DB: D1Database
  KV: KVNamespace
  PHOTOS_ORIGINAL: R2Bucket
  REINDEX_QUEUE: Queue<ReindexJob>
  IMAGE_QUEUE: Queue<ImageJob>
  IMAGES: ImagesBinding
  OPENROUTER_API_KEY: string
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
    batch: MessageBatch<ScrapeJob | ImageJob>,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    if (batch.queue === "dogpile-image-jobs") {
      return handleImageJobs(batch as MessageBatch<ImageJob>, env, ctx)
    }

    const scrapeMessages = batch as MessageBatch<ScrapeJob>
    for (const message of scrapeMessages.messages) {
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
        const removed = 0
        const reindexJobs: ReindexJob[] = []
        const now = new Date()

        for (const raw of rawDogs) {
          const dog = yield* adapter.transform(raw, config)
          const existing = existingByFingerprint.get(raw.fingerprint)

          if (!existing) {
            // New dog - run AI extraction
            const textExtractor = yield* TextExtractor
            const photoAnalyzer = yield* PhotoAnalyzer
            const descGenerator = yield* DescriptionGenerator

            const textResult = yield* textExtractor.extract(raw.rawDescription).pipe(
              Effect.catchAll((e) =>
                Effect.logWarning(`Text extraction failed: ${e}`).pipe(
                  Effect.map(() => null)
                )
              )
            )

            const photoResult = raw.photos && raw.photos.length > 0
              ? yield* photoAnalyzer.analyzeMultiple(raw.photos).pipe(
                  Effect.map(Option.some),
                  Effect.catchAll((e) =>
                    Effect.logWarning(`Photo analysis failed: ${e}`).pipe(
                      Effect.map(() => Option.none())
                    )
                  )
                )
              : Option.none()

            const bioResult = textResult
              ? yield* descGenerator.generate({
                  name: raw.name,
                  sex: textResult.sex,
                  breedEstimates: [...textResult.breedEstimates],
                  ageMonths: textResult.ageEstimate?.months ?? null,
                  size: textResult.sizeEstimate?.value ?? null,
                  personalityTags: [...textResult.personalityTags],
                  goodWithKids: textResult.goodWithKids,
                  goodWithDogs: textResult.goodWithDogs,
                  goodWithCats: textResult.goodWithCats,
                  healthInfo: {
                    vaccinated: textResult.vaccinated,
                    sterilized: textResult.sterilized,
                  },
                }).pipe(
                  Effect.catchAll((e) =>
                    Effect.logWarning(`Bio generation failed: ${e}`).pipe(
                      Effect.map(() => null)
                    )
                  )
                )
              : null

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
                  sex: (textResult?.sex ?? dog.sex) as "male" | "female" | "unknown" | null | undefined,
                  generatedBio: bioResult?.bio ?? dog.generatedBio,
                  locationName: textResult?.locationHints?.cityMention ?? dog.locationName,
                  locationCity: textResult?.locationHints?.cityMention ?? dog.locationCity,
                  locationLat: dog.locationLat,
                  locationLng: dog.locationLng,
                  isFoster: textResult?.locationHints?.isFoster ?? dog.isFoster,
                  breedEstimates: Option.isSome(photoResult)
                    ? [...photoResult.value.breedEstimates]
                    : textResult?.breedEstimates
                    ? [...textResult.breedEstimates]
                    : [],
                  sizeEstimate: textResult?.sizeEstimate ?? dog.sizeEstimate,
                  ageEstimate: textResult?.ageEstimate ?? dog.ageEstimate,
                  weightEstimate: textResult?.weightEstimate ?? dog.weightEstimate,
                  personalityTags: textResult?.personalityTags
                    ? [...textResult.personalityTags]
                    : [],
                  vaccinated: textResult?.vaccinated ?? dog.vaccinated,
                  sterilized: textResult?.sterilized ?? dog.sterilized,
                  chipped: textResult?.chipped ?? dog.chipped,
                  goodWithKids: textResult?.goodWithKids ?? dog.goodWithKids,
                  goodWithDogs: textResult?.goodWithDogs ?? dog.goodWithDogs,
                  goodWithCats: textResult?.goodWithCats ?? dog.goodWithCats,
                  furLength: (Option.isSome(photoResult)
                    ? photoResult.value.furLength
                    : dog.furLength) as "short" | "medium" | "long" | null | undefined,
                  furType: (Option.isSome(photoResult)
                    ? photoResult.value.furType
                    : dog.furType) as "smooth" | "wire" | "curly" | "double" | null | undefined,
                  colorPrimary: Option.isSome(photoResult)
                    ? photoResult.value.colorPrimary
                    : dog.colorPrimary,
                  colorSecondary: Option.isSome(photoResult)
                    ? photoResult.value.colorSecondary
                    : dog.colorSecondary,
                  colorPattern: (Option.isSome(photoResult)
                    ? photoResult.value.colorPattern
                    : dog.colorPattern) as "solid" | "spotted" | "brindle" | "merle" | "bicolor" | "tricolor" | "sable" | "tuxedo" | null | undefined,
                  earType: (Option.isSome(photoResult)
                    ? photoResult.value.earType
                    : dog.earType) as "floppy" | "erect" | "semi" | null | undefined,
                  tailType: (Option.isSome(photoResult)
                    ? photoResult.value.tailType
                    : dog.tailType) as "long" | "short" | "docked" | "curled" | null | undefined,
                  photos: dog.photos ? [...dog.photos] : [],
                  photosGenerated: dog.photosGenerated ? [...dog.photosGenerated] : [],
                  sourceUrl: dog.sourceUrl,
                  urgent: textResult?.urgent ?? dog.urgent ?? false,
                  status: "available",
                  lastSeenAt: now,
                  createdAt: now,
                  updatedAt: now,
                }),
              catch: (e) => new Error(`Failed to insert dog: ${e}`),
            })
            reindexJobs.push({
              type: "upsert",
              dogId: id,
              description: bioResult?.bio ?? dog.generatedBio ?? undefined,
            })

            if (dog.photos && dog.photos.length > 0) {
              const externalUrls = dog.photos.filter((url: string) => url.startsWith("http"))
              if (externalUrls.length > 0) {
                yield* Effect.tryPromise({
                  try: () => env.IMAGE_QUEUE.send({ dogId: id, urls: externalUrls }),
                  catch: (e) => new Error(`Failed to enqueue image job: ${e}`),
                })
              }
            }

            added++
          } else {
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

        for (const existing of existingDogs) {
          if (!scrapedFingerprints.has(existing.fingerprint)) {
            yield* Effect.tryPromise({
              try: () =>
                db.update(dogs).set({ status: "removed" }).where(eq(dogs.id, existing.id)),
              catch: (e) => new Error(`Failed to mark dog removed: ${e}`),
            })
            reindexJobs.push({ type: "delete", dogId: existing.id })
          }
        }

        if (reindexJobs.length > 0) {
          yield* Effect.tryPromise({
            try: () =>
              env.REINDEX_QUEUE.sendBatch(reindexJobs.map((j) => ({ body: j }))),
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
                dogsUpdated: 0,
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
          `Sync complete for ${job.shelterId}: +${added} -${removed}`
        )

        message.ack()
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            FetchHttpClient.layer,
            Layer.provide(
              Layer.mergeAll(TextExtractorLive, PhotoAnalyzerLive, DescriptionGeneratorLive),
              OpenRouterClientLive
            ),
            OpenRouterClientLive
          )
        ),
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
