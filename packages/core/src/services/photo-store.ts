import { Context, Effect, Layer } from "effect"
import { ImageStore } from "./image-store.js"
import { StorageError, NotFoundError } from "../domain/errors.js"

export interface PhotoStoreConfig {
  readonly bucket: R2Bucket
  readonly publicDomain: string
}

export const PhotoStoreConfig = Context.GenericTag<PhotoStoreConfig>("@dogpile/PhotoStoreConfig")

export const PhotoStoreLive = Layer.effect(
  ImageStore,
  Effect.gen(function* () {
    const config = yield* PhotoStoreConfig

    const impl: ImageStore = {
      upload: (key: string, data: ArrayBuffer, contentType: string) =>
        Effect.tryPromise({
          try: () => config.bucket.put(key, data, { httpMetadata: { contentType } }),
          catch: (e) => new StorageError({ operation: "write", cause: e, message: `Failed to upload ${key}` }),
        }).pipe(Effect.map(() => `https://${config.publicDomain}/${key}`)),

      download: (key: string) =>
        Effect.tryPromise({
          try: () => config.bucket.get(key),
          catch: (e) => new StorageError({ operation: "read", cause: e, message: `Failed to download ${key}` }),
        }).pipe(
          Effect.flatMap((obj): Effect.Effect<ArrayBuffer, NotFoundError | StorageError> =>
            obj
              ? Effect.tryPromise({
                  try: () => obj.arrayBuffer(),
                  catch: (e) => new StorageError({ operation: "read", cause: e, message: "Failed to read body" }),
                })
              : Effect.fail(new NotFoundError({ entity: "photo", id: key }))
          )
        ),

      delete: (key: string) =>
        Effect.tryPromise({
          try: () => config.bucket.delete(key),
          catch: (e) => new StorageError({ operation: "delete", cause: e, message: `Failed to delete ${key}` }),
        }).pipe(Effect.asVoid),

      getUrl: (key: string) =>
        Effect.succeed(`https://${config.publicDomain}/${key}`),
    }

    return impl
  })
)
