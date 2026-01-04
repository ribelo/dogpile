import { Context, Effect } from "effect"
import { StorageError, NotFoundError } from "../domain/errors.js"

export interface ImageStore {
  readonly upload: (key: string, data: ArrayBuffer, contentType: string) => Effect.Effect<string, StorageError>
  readonly download: (key: string) => Effect.Effect<ArrayBuffer, NotFoundError | StorageError>
  readonly delete: (key: string) => Effect.Effect<void, StorageError>
  readonly getUrl: (key: string) => Effect.Effect<string, StorageError>
}

export class ImageStore extends Context.Tag("@dogpile/ImageStore")<
  ImageStore,
  {
    readonly upload: (key: string, data: ArrayBuffer, contentType: string) => Effect.Effect<string, StorageError>
    readonly download: (key: string) => Effect.Effect<ArrayBuffer, NotFoundError | StorageError>
    readonly delete: (key: string) => Effect.Effect<void, StorageError>
    readonly getUrl: (key: string) => Effect.Effect<string, StorageError>
  }
>() {}
