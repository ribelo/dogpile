import { Context, Effect, Layer } from "effect"
import { StorageError } from "../domain/errors.js"

export interface PhotoStore {
  readonly uploadOriginal: (dogId: string, index: number, data: Uint8Array, contentType: string) => Effect.Effect<string, StorageError>
  readonly uploadOriginalFromUrl: (dogId: string, index: number, url: string) => Effect.Effect<string, StorageError>
  readonly uploadGenerated: (dogId: string, key: string, data: Uint8Array, contentType: string) => Effect.Effect<string, StorageError>
  readonly deleteOriginal: (key: string) => Effect.Effect<void, StorageError>
  readonly deleteGenerated: (key: string) => Effect.Effect<void, StorageError>
  readonly getOriginalUrl: (key: string) => Effect.Effect<string, StorageError>
  readonly getGeneratedUrl: (key: string) => Effect.Effect<string, StorageError>
  readonly listOriginal: (dogId: string) => Effect.Effect<readonly string[], StorageError>
  readonly listGenerated: (dogId: string) => Effect.Effect<readonly string[], StorageError>
}

export const PhotoStore = Context.GenericTag<PhotoStore>("@dogpile/PhotoStore")

export const makePhotoStore = (
  impl: PhotoStore
): Layer.Layer<PhotoStore> =>
  Layer.succeed(PhotoStore, impl)
