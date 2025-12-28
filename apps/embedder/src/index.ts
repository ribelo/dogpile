import { Effect } from "effect"

interface Env {
  VECTORIZE: VectorizeIndex
  OPENROUTER_API_KEY: string
  OPENROUTER_MODEL: string
}

interface ReindexJob {
  type: "upsert" | "delete"
  dogId: string
  description?: string
}

export default {
  async queue(
    batch: MessageBatch<ReindexJob>,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const program = Effect.gen(function* () {
      const upserts = batch.messages.filter((m) => m.body.type === "upsert" && m.body.description)
      const deletes = batch.messages.filter((m) => m.body.type === "delete")

      if (deletes.length > 0) {
        const ids = deletes.map((m) => m.body.dogId)
        yield* Effect.tryPromise({
          try: () => env.VECTORIZE.deleteByIds(ids),
          catch: (e) => new Error(`Failed to delete vectors: ${e}`),
        })
        yield* Effect.logInfo(`Deleted ${ids.length} vectors`)
        deletes.forEach((m) => m.ack())
      }

      if (upserts.length > 0) {
        const texts = upserts.map((m) => m.body.description!)

        const embeddings = yield* Effect.tryPromise({
          try: async () => {
            const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: env.OPENROUTER_MODEL,
                input: texts,
              }),
            })

            if (!response.ok) {
              const error = await response.text()
              throw new Error(`OpenRouter API error: ${error}`)
            }

            const data = await response.json() as {
              data: Array<{ embedding: number[] }>
            }
            return data.data.map((d) => d.embedding)
          },
          catch: (e) => new Error(`Failed to generate embeddings: ${e}`),
        })

        const vectors = upserts.map((m, i) => ({
          id: m.body.dogId,
          values: embeddings[i],
          metadata: {},
        }))

        yield* Effect.tryPromise({
          try: () => env.VECTORIZE.upsert(vectors),
          catch: (e) => new Error(`Failed to upsert vectors: ${e}`),
        })

        yield* Effect.logInfo(`Upserted ${vectors.length} vectors`)
        upserts.forEach((m) => m.ack())
      }
    }).pipe(
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
