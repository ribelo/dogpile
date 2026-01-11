import { Cause, ConfigProvider, Effect, Layer, Schema } from "effect"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import { dogs } from "@dogpile/db"
import type { PhotosGenerateJob } from "@dogpile/core/queues"
import { ImageGenerator } from "@dogpile/core/services/image-generator"
import { OpenRouterClient } from "@dogpile/core/services/openrouter/client"

export interface ImagesBinding {
  input(data: ArrayBuffer | ReadableStream): ImageTransformer
}

export interface ImageTransformer {
  transform(options: { width?: number; height?: number; fit?: string; quality?: number }): ImageTransformer
  output(options?: { format?: string }): Promise<ImageOutput>
}

interface ImageOutput {
  response(): Response
}

export interface Env {
  DB: D1Database
  PHOTOS_GENERATED: R2Bucket
  IMAGES: ImagesBinding
  OPENROUTER_API_KEY: string
  MODEL_IMAGE_GEN: string
}

export type HandlerDecision = "ack" | "retry"

class InfraError extends Schema.TaggedError<InfraError>()("InfraError", {
  operation: Schema.String,
  cause: Schema.Defect,
}) {}

export const handlePhotosGenerateJob = (
  body: unknown,
  env: Env
): Effect.Effect<HandlerDecision> =>
  handlePhotosGenerateJobBase(body, env).pipe(
    Effect.provide(ImageGenerator.Live.pipe(Layer.provide(OpenRouterClient.Live))),
    Effect.withConfigProvider(makeConfigProvider(env)),
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        const retry = isRetryable(error)
        yield* Effect.logError(`photo-generator: job failed (${retry ? "retry" : "ack"}): ${String(error)}`)
        return retry ? "retry" : "ack"
      })
    )
  )

const makeConfigProvider = (env: Env): ConfigProvider.ConfigProvider =>
  ConfigProvider.fromMap(new Map([
    ["OPENROUTER_API_KEY", env.OPENROUTER_API_KEY],
    ["MODEL_IMAGE_GEN", env.MODEL_IMAGE_GEN],
  ]))

type Db = ReturnType<typeof drizzle>

type DogRow = {
  readonly id: string
  readonly fingerprint: string
  readonly generatedBio: string | null
  readonly photos: unknown
  readonly photosGenerated: unknown
}

type DogData = {
  readonly id: string
  readonly fingerprint: string
  readonly generatedBio: string | null
  readonly photos: readonly string[]
  readonly photosGenerated: readonly string[]
}

const handlePhotosGenerateJobBase = Effect.fn("photo-generator.handlePhotosGenerateJob")(function* (
  body: unknown,
  env: Env
) {
  const job = parsePhotosGenerateJob(body)
  if (!job) {
    yield* Effect.logWarning(
      `photo-generator: unexpected envelope type: ${String((body as { type?: unknown } | null)?.type)}`
    )
    return "ack" as const
  }

  yield* Effect.logInfo(
    `photo-generator: received photos.generate (traceId=${job.traceId} dogId=${job.payload.dogId} variant=${job.payload.variant})`
  )

  const db = drizzle(env.DB)

  const dogRow = yield* loadDog(db, job.payload.dogId)

  if (!dogRow) {
    yield* Effect.logWarning(`photo-generator: dog not found: ${job.payload.dogId}`)
    return "ack" as const
  }

  const dog = toDogData(dogRow)
  if (!dog) {
    yield* Effect.logError(`photo-generator: unexpected dog schema for ${dogRow.id}`)
    return "ack" as const
  }

  if (!dog.generatedBio) {
    yield* Effect.logWarning(`photo-generator: missing generatedBio for dog ${dog.id}`)
    return "ack" as const
  }

  yield* processJob(job, dog, db, env)

  return "ack" as const
})

const loadDog = (db: Db, dogId: string) =>
  Effect.tryPromise({
    try: () =>
      db
        .select({
          id: dogs.id,
          fingerprint: dogs.fingerprint,
          generatedBio: dogs.generatedBio,
          photos: dogs.photos,
          photosGenerated: dogs.photosGenerated,
        })
        .from(dogs)
        .where(eq(dogs.id, dogId))
        .get() as Promise<DogRow | undefined>,
    catch: (cause) => new InfraError({ operation: "load dog from DB", cause }),
  })

const toDogData = (row: DogRow): DogData | null => {
  if (!Array.isArray(row.photos) || !isStringArray(row.photos)) return null
  if (!Array.isArray(row.photosGenerated) || !isStringArray(row.photosGenerated)) return null

  return {
    id: row.id,
    fingerprint: row.fingerprint,
    generatedBio: row.generatedBio,
    photos: row.photos,
    photosGenerated: row.photosGenerated,
  }
}

const isStringArray = (value: unknown[]): value is string[] =>
  value.every((item) => typeof item === "string")

const generatePhoto = Effect.fn("photo-generator.generatePhoto")(function* (input: {
  readonly variant: "professional" | "nose"
  readonly dogDescription: string
  readonly referencePhotoUrl?: string
}) {
  const imageGen = yield* ImageGenerator
  return yield* imageGen.generatePhoto(input).pipe(Effect.timeout("25 seconds"))
})

const processJob = Effect.fn("photo-generator.processJob")(function* (
  job: PhotosGenerateJob,
  dog: DogData,
  db: Db,
  env: Env
) {
  const baseKey = `${dog.fingerprint}-${job.payload.variant}`
  const generatedKey = `generated/${baseKey}`

  if (dog.photosGenerated.includes(generatedKey) && job.payload.force !== true) {
    yield* Effect.logInfo(`photo-generator: already generated, skipping: ${generatedKey}`)
    return
  }

  const referencePhotoUrl = selectReferencePhotoUrl(dog.photos)
  if (!referencePhotoUrl) {
    yield* Effect.logWarning(`photo-generator: no processed reference photo found for dog ${dog.id}, generating without reference`)
  }

  const generated = yield* generatePhoto({
    variant: job.payload.variant,
    dogDescription: dog.generatedBio ?? "",
    ...(referencePhotoUrl ? { referencePhotoUrl } : {}),
  })

  if (!generated) {
    yield* Effect.logWarning(
      `photo-generator: OpenRouter returned no image (traceId=${job.traceId} dogId=${dog.id} variant=${job.payload.variant})`
    )
    return
  }

  const raw = decodeDataUrlToArrayBuffer(generated.base64Url)
  if (!raw) {
    yield* Effect.logError(
      `photo-generator: invalid image data URL (traceId=${job.traceId} dogId=${dog.id} variant=${job.payload.variant})`
    )
    return
  }

  yield* uploadGeneratedPhotos(raw, baseKey, env)
  yield* setGeneratedKey(db, dog.id, dog.photosGenerated, generatedKey)

  yield* Effect.logInfo(
    `photo-generator: generated ${job.payload.variant} for dog ${dog.id} (${generatedKey})`
  )
})

const uploadGeneratedPhotos = (buffer: ArrayBuffer, baseKey: string, env: Env) =>
  Effect.all([
    transformAndUpload(buffer, baseKey, "sm", env),
    transformAndUpload(buffer, baseKey, "lg", env),
  ], { concurrency: 2 }).pipe(Effect.asVoid)

const setGeneratedKey = (db: Db, dogId: string, current: readonly string[], generatedKey: string) => {
  const updatedPhotosGenerated = dedupe([...current, generatedKey])
  return Effect.tryPromise({
    try: () =>
      db
        .update(dogs)
        .set({ photosGenerated: updatedPhotosGenerated, updatedAt: new Date() })
        .where(eq(dogs.id, dogId)),
    catch: (cause) => new InfraError({ operation: "update photosGenerated", cause }),
  })
}

const parsePhotosGenerateJob = (body: unknown): PhotosGenerateJob | null => {
  if (typeof body !== "object" || body === null) return null

  const type = (body as { type?: unknown }).type
  if (type !== "photos.generate") return null

  const payload = (body as { payload?: unknown }).payload
  if (typeof payload !== "object" || payload === null) return null

  const dogId = (payload as { dogId?: unknown }).dogId
  const variant = (payload as { variant?: unknown }).variant
  const force = (payload as { force?: unknown }).force

  if (typeof dogId !== "string") return null
  if (variant !== "professional" && variant !== "nose") return null
  if (force !== undefined && typeof force !== "boolean") return null

  const traceId = (body as { traceId?: unknown }).traceId
  if (typeof traceId !== "string") return null

  return body as PhotosGenerateJob
}

const selectReferencePhotoUrl = (photos: readonly string[]): string | undefined => {
  const processedKey = photos.find((p) => typeof p === "string" && p.startsWith("dogs/"))
  if (processedKey) {
    return `https://dogpile.extropy.club/${processedKey}-lg.webp`
  }

  return undefined
}

const decodeDataUrlToArrayBuffer = (dataUrl: string): ArrayBuffer | null => {
  if (!dataUrl.startsWith("data:")) return null
  const marker = "base64,"
  const idx = dataUrl.indexOf(marker)
  if (idx === -1) return null

  const base64 = dataUrl.slice(idx + marker.length)

  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
  } catch {
    return null
  }
}

const transformAndUpload = Effect.fn("photo-generator.transformAndUpload")(function* (
  buffer: ArrayBuffer,
  baseKey: string,
  size: "sm" | "lg",
  env: Env
) {
  const spec = size === "sm"
    ? { width: 512, height: 640 }
    : { width: 1024, height: 1280 }

  return yield* Effect.tryPromise({
    try: async () => {
      const key = `${baseKey}-${size}.webp`
      const output = await env.IMAGES.input(buffer)
        .transform({ ...spec, fit: "cover", quality: 85 })
        .output({ format: "image/webp" })

      const transformed = await output.response().arrayBuffer()

      await env.PHOTOS_GENERATED.put(key, transformed, {
        httpMetadata: { contentType: "image/webp" },
      })
    },
    catch: (cause) => new InfraError({ operation: `transform/upload ${size}`, cause }),
  })
})

const dedupe = (items: readonly string[]): string[] => {
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }
  return out
}

const isRetryable = (error: unknown): boolean => {
  if (Cause.isTimeoutException(error)) return true

  const tag = typeof error === "object" && error !== null && "_tag" in error
    ? (error as { _tag?: unknown })._tag
    : null

  if (tag === "RateLimitError") return true
  if (tag === "NetworkError") return true
  if (tag === "OpenRouterError") {
    const status = (error as { status?: unknown }).status
    return typeof status === "number" && status >= 500
  }

  return true
}
