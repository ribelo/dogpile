import { Effect, Layer, Schedule, Schema } from "effect"
import {
  ApiCostTracker,
  EmbeddingService,
  OpenRouterClient,
} from "@dogpile/core/services"

class VectorizeError extends Schema.TaggedError<VectorizeError>()("VectorizeError", {
  operation: Schema.String,
  cause: Schema.Defect,
}) {}

class ApiCostInsertError extends Schema.TaggedError<ApiCostInsertError>()("ApiCostInsertError", {
  cause: Schema.Defect,
}) {}

interface Env {
  DB: D1Database
  VECTORIZE: VectorizeIndex
  OPENROUTER_API_KEY: string
  OPENROUTER_MODEL: string
}

interface ReindexJob {
  type: "upsert" | "delete"
  dogId: string
  description?: string
  metadata?: {
    shelterId?: string
    city?: string
    size?: string
    ageMonths?: number
    sex?: string
  }
}

export default {
  async queue(
    batch: MessageBatch<ReindexJob>,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const insertCost = env.DB.prepare(
      "INSERT INTO api_costs (id, created_at, operation, model, input_tokens, output_tokens, cost_usd) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    const ApiCostTrackerLive = Layer.succeed(
      ApiCostTracker,
      ApiCostTracker.of({
        log: (entry) =>
          Effect.tryPromise({
            try: () =>
              insertCost
                .bind(
                  crypto.randomUUID(),
                  entry.createdAt.getTime(),
                  entry.operation,
                  entry.model,
                  entry.inputTokens,
                  entry.outputTokens,
                  entry.costUsd
                )
                .run()
                .then(() => undefined),
            catch: (e) => new ApiCostInsertError({ cause: e }),
          }).pipe(
            Effect.catchAll((e) =>
              Effect.logWarning(`api_costs insert failed: ${e}`).pipe(Effect.asVoid)
            )
          ),
      })
    )

    const program = Effect.gen(function* () {
      const upserts = batch.messages.filter((m) => m.body.type === "upsert" && m.body.description)
      const deletes = batch.messages.filter((m) => m.body.type === "delete")

      if (deletes.length > 0) {
        const ids = deletes.map((m) => m.body.dogId)
        yield* Effect.tryPromise({
          try: () => env.VECTORIZE.deleteByIds(ids),
          catch: (e) => new VectorizeError({ operation: "delete", cause: e }),
        }).pipe(
          Effect.retry(
            Schedule.exponential("100 millis").pipe(Schedule.compose(Schedule.recurs(3)))
          )
        )
        yield* Effect.logInfo(`Deleted ${ids.length} vectors`)
        deletes.forEach((m) => m.ack())
      }

      if (upserts.length > 0) {
        const texts = upserts.map((m) => m.body.description!)

        const embeddingService = yield* EmbeddingService
        const embeddings = yield* embeddingService.embedBatch(texts)

        const vectors = upserts.map((m, i) => ({
          id: m.body.dogId,
          values: Array.from(embeddings[i]),
          metadata: m.body.metadata || {},
        }))

        yield* Effect.tryPromise({
          try: () => env.VECTORIZE.upsert(vectors),
          catch: (e) => new VectorizeError({ operation: "upsert", cause: e }),
        })

        yield* Effect.logInfo(`Upserted ${vectors.length} vectors`)
        upserts.forEach((m) => m.ack())
      }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          ApiCostTrackerLive,
          Layer.provide(EmbeddingService.Live, OpenRouterClient.Live),
          OpenRouterClient.Live
        )
      ),
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          yield* Effect.logError(`Embedding failed: ${error}`)
          batch.messages.forEach((m) => m.retry())
        })
      )
    )

    ctx.waitUntil(Effect.runPromise(program))
  },
}
