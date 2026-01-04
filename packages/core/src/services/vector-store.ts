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

export class VectorStore extends Context.Tag("@dogpile/VectorStore")<
  VectorStore,
  {
    readonly upsert: (id: string, vector: readonly number[], metadata?: Record<string, unknown>) => Effect.Effect<void, StorageError>
    readonly upsertBatch: (items: readonly { id: string; vector: readonly number[]; metadata?: Record<string, unknown> }[]) => Effect.Effect<void, StorageError>
    readonly delete: (id: string) => Effect.Effect<void, StorageError>
    readonly deleteBatch: (ids: readonly string[]) => Effect.Effect<void, StorageError>
    readonly query: (vector: readonly number[], topK: number) => Effect.Effect<readonly VectorSearchResult[], StorageError>
  }
>() {
  static readonly make = (impl: Context.Tag.Service<VectorStore>): Layer.Layer<VectorStore> =>
    Layer.succeed(this, impl)
}
