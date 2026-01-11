import { Cause, Effect, Layer, Option, Ref, Schema } from "effect"
import { FetchHttpClient } from "@effect/platform"
import { drizzle } from "drizzle-orm/d1"
import { apiCosts, dogs, shelters, syncLogs } from "@dogpile/db"
import { getAdapter } from "@dogpile/scrapers"
import { eq, and, sql, inArray } from "drizzle-orm"
import {
  TextExtractor,
  PhotoAnalyzer,
  DescriptionGenerator,
  ApiCostTracker,
  OpenRouterClient,
} from "@dogpile/core/services"
import { handleImageJobs, type ImageJob, type ImagesBinding } from "./image-handler.js"
import { DatabaseError, QueueError } from "./errors.js"

class ApiCostInsertError extends Schema.TaggedError<ApiCostInsertError>()("ApiCostInsertError", {
  cause: Schema.Defect,
}) {}

interface Env {
  DB: D1Database
  KV: KVNamespace
  PHOTOS_ORIGINAL: R2Bucket
  REINDEX_QUEUE: Queue<ReindexJob>
  IMAGE_QUEUE: Queue<ImageJob>
  IMAGES: ImagesBinding
  OPENROUTER_API_KEY: string
  SCRAPER_AI_CONCURRENCY?: string
}

interface ScrapeJob {
  shelterId: string
  shelterSlug: string
  baseUrl: string
  syncLogId?: string
}

interface ReindexJob {
  type: "upsert" | "delete"
  dogId: string
  description?: string | undefined
}

// Config constants
const MAX_COLLECTED_ERRORS = 20
const PROGRESS_UPDATE_INTERVAL = 10
const DEFAULT_CONCURRENCY = 5
const MIN_CONCURRENCY = 1
const MAX_CONCURRENCY = 10

const parseAiConcurrency = (env: Env): number => {
  const raw = env.SCRAPER_AI_CONCURRENCY
  if (!raw) return DEFAULT_CONCURRENCY
  const parsed = parseInt(raw, 10)
  if (Number.isNaN(parsed)) return DEFAULT_CONCURRENCY
  return Math.max(MIN_CONCURRENCY, Math.min(MAX_CONCURRENCY, parsed))
}

// Per-dog processing result
interface DogResult {
  type: "added" | "updated" | "error"
  reindexJob?: ReindexJob
  errorMessage?: string
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
      ctx.waitUntil(Effect.runPromise(processMessage(message, env)))
    }
  },
}

export const processMessageBase = (
  message: Message<ScrapeJob>,
  env: Env,
  syncLogId: string
) => Effect.gen(function* () {
  const job = message.body
  const db = drizzle(env.DB)
  const adapter = getAdapter(job.shelterSlug)
  const concurrency = parseAiConcurrency(env)

  if (!adapter) {
    yield* Effect.logError(`Unknown scraper: ${job.shelterSlug}`)
    message.ack()
    return
  }

  const startedAt = new Date()

  // Best-effort: the API may have already created the sync log entry when enqueueing.
  // We avoid reading `sync_logs` here to keep worker execution + tests simple.
  yield* Effect.tryPromise({
    try: () =>
      env.DB.prepare(
        `INSERT INTO sync_logs (
          id,
          shelter_id,
          started_at,
          finished_at,
          dogs_added,
          dogs_updated,
          dogs_removed,
          errors,
          error_message
        ) VALUES (?, ?, ?, NULL, 0, 0, 0, ?, NULL)
        ON CONFLICT(id) DO NOTHING`
      ).bind(syncLogId, job.shelterId, startedAt.getTime(), JSON.stringify([])).run(),
    catch: (e) => new DatabaseError({ operation: "create sync log", cause: e }),
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
        .select({ fingerprint: dogs.fingerprint, id: dogs.id, status: dogs.status })
        .from(dogs)
        .where(eq(dogs.shelterId, job.shelterId))
        .all(),
    catch: (e) => new DatabaseError({ operation: "fetch existing dogs", cause: e }),
  })

  const availableExistingDogs = existingDogs.filter((d) => d.status === "available")
  const existingCount = availableExistingDogs.length
  const scrapedCount = rawDogs.length
  const threshold = 0.7

  if (existingCount > 5 && scrapedCount < existingCount * threshold) {
    yield* Effect.logWarning(`Significant dog count drop: scraped ${scrapedCount} dogs, expected ~${existingCount}. Proceeding with caution.`)

    if (scrapedCount < existingCount * 0.3) {
      const errorMessage = `Circuit breaker triggered: scraped ${scrapedCount} dogs, expected ~${existingCount}. Will retry.`
      yield* Effect.logWarning(errorMessage)

      yield* Effect.tryPromise({
        try: () =>
          db
            .update(syncLogs)
            .set({
              finishedAt: new Date(),
              errors: [errorMessage],
              errorMessage,
            })
            .where(eq(syncLogs.id, syncLogId)),
          catch: (e) => new DatabaseError({ operation: "update sync log (circuit breaker)", cause: e }),
        })

      message.retry()
      return
    }
  }

  const existingByFingerprint = new Map(existingDogs.map((d) => [d.fingerprint, d]))

  // Use Refs for mutable state across concurrent processing
  const addedRef = yield* Ref.make(0)
  const updatedRef = yield* Ref.make(0)
  const reindexJobsRef = yield* Ref.make<ReindexJob[]>([])
  const errorsRef = yield* Ref.make<string[]>([])
  const processedCountRef = yield* Ref.make(0)
  const now = new Date()

  // Process a single dog, isolating failures
  const processSingleDog = (raw: typeof rawDogs[number]): Effect.Effect<DogResult, never, TextExtractor | PhotoAnalyzer | DescriptionGenerator> =>
    Effect.gen(function* () {
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
              status: "pending",
              lastSeenAt: now,
              createdAt: now,
              updatedAt: now,
            }),
          catch: (e) => new DatabaseError({ operation: "insert dog", cause: e }),
        })

        return {
          type: "added" as const,
          reindexJob: {
            type: "upsert" as const,
            dogId: id,
            description: bioResult?.bio ?? dog.generatedBio ?? undefined,
          },
        }
      } else {
        const updates =
          existing.status === "removed"
            ? { lastSeenAt: now, status: "available" as const, updatedAt: now }
            : { lastSeenAt: now }
        yield* Effect.tryPromise({
          try: () =>
            db
              .update(dogs)
              .set(updates)
              .where(eq(dogs.id, existing.id)),
          catch: (e) => new DatabaseError({ operation: "update lastSeenAt", cause: e }),
        })
        return { type: "updated" as const }
      }
    }).pipe(
      Effect.catchAllCause((cause) => {
        const msg = Cause.pretty(cause).split("\n")[0]?.trim() || "Unknown error"
        return Effect.succeed({ type: "error" as const, errorMessage: `${raw.fingerprint}: ${msg}` })
      })
    )

  // Update progress in sync_logs periodically
  const updateProgress = Effect.gen(function* () {
    const added = yield* Ref.get(addedRef)
    const updated = yield* Ref.get(updatedRef)
    yield* Effect.tryPromise({
      try: () =>
        db
          .update(syncLogs)
          .set({ dogsAdded: added, dogsUpdated: updated })
          .where(eq(syncLogs.id, syncLogId)),
      catch: (e) => new DatabaseError({ operation: "update progress", cause: e }),
    }).pipe(Effect.catchAll(() => Effect.void))
  })

  // Process all dogs with bounded concurrency
  yield* Effect.forEach(
    rawDogs,
    (raw) =>
      Effect.gen(function* () {
        const result = yield* processSingleDog(raw)

        // Update counters and collect results
        if (result.type === "added") {
          yield* Ref.update(addedRef, (n) => n + 1)
          if (result.reindexJob) {
            yield* Ref.update(reindexJobsRef, (jobs) => [...jobs, result.reindexJob!])
          }
        } else if (result.type === "updated") {
          yield* Ref.update(updatedRef, (n) => n + 1)
        } else if (result.type === "error" && result.errorMessage) {
          yield* Ref.update(errorsRef, (errs) =>
            errs.length < MAX_COLLECTED_ERRORS ? [...errs, result.errorMessage!] : errs
          )
        }

        // Periodic progress update
        const processed = yield* Ref.updateAndGet(processedCountRef, (n) => n + 1)
        if (processed % PROGRESS_UPDATE_INTERVAL === 0) {
          yield* updateProgress
        }
      }),
    { concurrency }
  )

  // Read final values from refs
  const added = yield* Ref.get(addedRef)
  const updated = yield* Ref.get(updatedRef)
  const reindexJobs = yield* Ref.get(reindexJobsRef)
  const collectedErrors = yield* Ref.get(errorsRef)

  // After processing found dogs, sweep for stale dogs
  const staleThreshold = 36 * 60 * 60 * 1000 // 36 hours in ms
  let dogsRemoved = 0
  // Find dogs that haven't been seen in 36+ hours and are still "available"
  const staleDogs = yield* Effect.tryPromise({
    try: () =>
      db
        .select({ id: dogs.id, fingerprint: dogs.fingerprint })
        .from(dogs)
        .where(
          and(
            eq(dogs.shelterId, job.shelterId),
            eq(dogs.status, "available"),
            sql`${dogs.lastSeenAt} < ${now.getTime() - staleThreshold}`
          )
        )
        .all(),
    catch: (e) => new DatabaseError({ operation: "find stale dogs", cause: e }),
  })

  if (staleDogs.length > 0) {
    const BATCH_SIZE = 500
    const staleIds = staleDogs.map((d) => d.id)

    // Batch updates in chunks to avoid SQLite variable limit
    for (let i = 0; i < staleIds.length; i += BATCH_SIZE) {
      const chunk = staleIds.slice(i, i + BATCH_SIZE)
      yield* Effect.tryPromise({
        try: () =>
          db.update(dogs)
            .set({ status: "removed", updatedAt: now })
            .where(inArray(dogs.id, chunk)),
        catch: (e) => new DatabaseError({ operation: "mark dogs removed", cause: e }),
      })
    }

    const QUEUE_BATCH_SIZE = 100

    // Batch queue messages
    for (let i = 0; i < staleDogs.length; i += QUEUE_BATCH_SIZE) {
      const chunk = staleDogs.slice(i, i + QUEUE_BATCH_SIZE)
      yield* Effect.tryPromise({
        try: () => env.REINDEX_QUEUE.sendBatch(
          chunk.map(stale => ({ body: { type: "delete" as const, dogId: stale.id } }))
        ),
        catch: (e) => new QueueError({ operation: "enqueue delete jobs", cause: e }),
      })
    }

    dogsRemoved = staleDogs.length
  }

  if (reindexJobs.length > 0) {
    const QUEUE_BATCH_SIZE = 100
    for (let i = 0; i < reindexJobs.length; i += QUEUE_BATCH_SIZE) {
      const chunk = reindexJobs.slice(i, i + QUEUE_BATCH_SIZE)
      yield* Effect.tryPromise({
        try: () =>
          env.REINDEX_QUEUE.sendBatch(chunk.map((j) => ({ body: j }))),
        catch: (e) => new QueueError({ operation: "enqueue reindex jobs", cause: e }),
      })
    }
  }

  yield* Effect.tryPromise({
    try: () =>
      db
        .update(syncLogs)
        .set({
          finishedAt: new Date(),
          dogsAdded: added,
          dogsUpdated: updated,
          dogsRemoved,
          errors: collectedErrors,
          errorMessage: collectedErrors.length > 0
            ? `${collectedErrors.length} dog(s) failed processing`
            : null,
        })
        .where(eq(syncLogs.id, syncLogId)),
    catch: (e) => new DatabaseError({ operation: "update sync log", cause: e }),
  })

  yield* Effect.tryPromise({
    try: () =>
      db
        .update(shelters)
        .set({ lastSync: new Date(), status: "active" })
        .where(eq(shelters.id, job.shelterId))
        .run(),
    catch: (e) => new DatabaseError({ operation: "update shelter", cause: e }),
  })

  yield* Effect.logInfo(
    `Sync complete for ${job.shelterId}: +${added} -${dogsRemoved}`
  )

  message.ack()
}).pipe(
  Effect.catchAllCause((cause) =>
    Effect.gen(function* () {
      const messageText = Cause.pretty(cause).split("\n")[0]?.trim() || "Unknown error"

      yield* Effect.logError(`Scrape failed: ${messageText}`)

      const db = drizzle(env.DB)
      yield* Effect.tryPromise({
        try: () =>
          db
            .update(syncLogs)
            .set({
              finishedAt: new Date(),
              errors: [messageText],
              errorMessage: messageText,
            })
            .where(eq(syncLogs.id, syncLogId)),
        catch: (e) => new DatabaseError({ operation: "update sync log (error)", cause: e }),
      }).pipe(Effect.catchAll(() => Effect.void))

      message.ack()
    })
  )
)

const processMessage = (message: Message<ScrapeJob>, env: Env) => {
  const syncLogId = message.body.syncLogId ?? crypto.randomUUID()
  const costDb = drizzle(env.DB)
  const ApiCostTrackerLive = Layer.succeed(
    ApiCostTracker,
    ApiCostTracker.of({
      log: (entry) =>
        Effect.tryPromise({
          try: () =>
            costDb.insert(apiCosts).values({
              id: crypto.randomUUID(),
              createdAt: entry.createdAt,
              operation: entry.operation,
              model: entry.model,
              inputTokens: entry.inputTokens,
              outputTokens: entry.outputTokens,
              costUsd: entry.costUsd,
            }),
          catch: (e) => new ApiCostInsertError({ cause: e }),
        }).pipe(
          Effect.catchAll((e) =>
            Effect.logWarning(`api_costs insert failed: ${e}`).pipe(Effect.asVoid)
          )
        ),
    })
  )

  return processMessageBase(message, env, syncLogId).pipe(
    Effect.provide(
      Layer.mergeAll(
        FetchHttpClient.layer,
        ApiCostTrackerLive,
        Layer.provide(
          Layer.mergeAll(
            TextExtractor.Live,
            PhotoAnalyzer.Live,
            DescriptionGenerator.Live
          ),
          OpenRouterClient.Live
        ),
        OpenRouterClient.Live
      )
    ),
    Effect.withSpan("scraper.processMessage")
  )
}
