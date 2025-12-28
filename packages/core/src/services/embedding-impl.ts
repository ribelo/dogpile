import { Effect, Layer } from "effect"
import { EmbeddingService } from "./embedding.js"
import { OpenRouterClient } from "./openrouter/client.js"
import { aiConfig } from "../config/ai.js"
import { EmbeddingError } from "../domain/errors.js"

export const EmbeddingServiceLive = Layer.effect(
  EmbeddingService,
  Effect.gen(function* () {
    const client = yield* OpenRouterClient
    const config = yield* aiConfig

    return {
      embed: (text: string) =>
        client.embeddings({
          model: config.embeddingModel,
          input: text,
        }).pipe(
          Effect.map((result) => result.data[0].embedding),
          Effect.mapError((err) =>
            new EmbeddingError({ cause: err, message: "Embedding failed" })
          )
        ),

      embedBatch: (texts: readonly string[]) =>
        client.embeddings({
          model: config.embeddingModel,
          input: [...texts],
        }).pipe(
          Effect.map((result) => result.data.map((d) => d.embedding)),
          Effect.mapError((err) =>
            new EmbeddingError({ cause: err, message: "Batch embedding failed" })
          )
        ),
    }
  })
)
