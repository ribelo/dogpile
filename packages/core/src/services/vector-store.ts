import { Context, Effect, Layer } from "effect"
import { StorageError } from "../domain/errors.js"

export interface VectorSearchResult {
  readonly id: string
  readonly score: number
}

export interface VectorStore {
  readonly upsert: (id: string, vector: readonly number[], metadata?: Record<string, unknown>) => Effect.Effect<void, StorageError>
  readonly upsertBatch: (items: readonly { id: string; vector: readonly number[]; metadata?: Record<string, unknown> }[]) => Effect.Effect<void, StorageError>
  readonly delete: (id: string) => Effect.Effect<void, StorageError>
  readonly deleteBatch: (ids: readonly string[]) => Effect.Effect<void, StorageError>
  readonly query: (vector: readonly number[], topK: number) => Effect.Effect<readonly VectorSearchResult[], StorageError>
}

export const VectorStore = Context.GenericTag<VectorStore>("@dogpile/VectorStore")

export const makeVectorStore = (
  impl: VectorStore
): Layer.Layer<VectorStore> =>
  Layer.succeed(VectorStore, impl)
