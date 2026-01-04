import { Context, Effect, Layer } from "effect"
import { EmbeddingError } from "../domain/errors.js"
import { OpenRouterClient } from "./openrouter/client.js"
import { aiConfig } from "../config/ai.js"

export class EmbeddingService extends Context.Tag("@dogpile/EmbeddingService")<
  EmbeddingService,
  {
    readonly embed: (text: string) => Effect.Effect<readonly number[], EmbeddingError>
    readonly embedBatch: (
      texts: readonly string[]
    ) => Effect.Effect<readonly (readonly number[])[], EmbeddingError>
  }
>() {
  static readonly Live = Layer.effect(
    this,
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
}
