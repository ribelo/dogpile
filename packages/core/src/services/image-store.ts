import { Context, Effect, Layer } from "effect"
import { StorageError } from "../domain/errors.js"

export interface ImageStore {
  readonly upload: (key: string, data: Uint8Array, contentType: string) => Effect.Effect<string, StorageError>
  readonly uploadFromUrl: (key: string, url: string) => Effect.Effect<string, StorageError>
  readonly delete: (key: string) => Effect.Effect<void, StorageError>
  readonly getUrl: (key: string) => Effect.Effect<string, StorageError>
}

export const ImageStore = Context.GenericTag<ImageStore>("@dogpile/ImageStore")

export const makeImageStore = (
  impl: ImageStore
): Layer.Layer<ImageStore> =>
  Layer.succeed(ImageStore, impl)
