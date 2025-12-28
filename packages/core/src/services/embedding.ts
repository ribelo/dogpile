import { Context, Effect, Layer } from "effect"
import { EmbeddingError } from "../domain/errors.js"

export interface EmbeddingService {
  readonly embed: (text: string) => Effect.Effect<readonly number[], EmbeddingError>
  readonly embedBatch: (texts: readonly string[]) => Effect.Effect<readonly (readonly number[])[], EmbeddingError>
}

export const EmbeddingService = Context.GenericTag<EmbeddingService>("@dogpile/EmbeddingService")

export const makeEmbeddingService = (
  impl: EmbeddingService
): Layer.Layer<EmbeddingService> =>
  Layer.succeed(EmbeddingService, impl)
