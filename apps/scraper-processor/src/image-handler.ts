import { Effect } from "effect"
import { drizzle } from "drizzle-orm/d1"
import { dogs } from "@dogpile/db"
import { eq } from "drizzle-orm"
import { DatabaseError, HttpError, ImageHandlerError } from "./errors.js"

export interface ImageJob {
  dogId: string
  urls: string[]
}

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

interface ImageEnv {
  DB: D1Database
  PHOTOS_ORIGINAL: R2Bucket
  IMAGES: ImagesBinding
}

const IMAGE_SIZES = {
  sm: { width: 400, quality: 80 },
  lg: { width: 1200, quality: 85 },
} as const

async function sha256Short(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("")
  return hashHex.slice(0, 8)
}

export async function handleImageJobs(
  batch: MessageBatch<ImageJob>,
  env: ImageEnv,
  ctx: ExecutionContext
): Promise<void> {
  for (const message of batch.messages) {
    ctx.waitUntil(Effect.runPromise(handleImageJob(message, env)))
  }
}

const handleImageJobBase = Effect.fn("scraper.handleImageJob")(function* (
  message: Message<ImageJob>,
  env: ImageEnv
) {
  const job = message.body
  const db = drizzle(env.DB)
  const processedKeys: string[] = []

  for (const url of job.urls) {
    const result = yield* processImage(url, job.dogId, env).pipe(
      Effect.catchAll((e) =>
        Effect.logWarning(`Failed to process image ${url}: ${e}`).pipe(
          Effect.map(() => null)
        )
      )
    )

    if (result) {
      processedKeys.push(result)
    }
  }

  if (processedKeys.length > 0) {
    yield* Effect.tryPromise({
      try: async () => {
        const dog = await db
          .select({ photos: dogs.photos })
          .from(dogs)
          .where(eq(dogs.id, job.dogId))
          .get()
        if (!dog) return

        const existingPhotos = dog.photos || []
        const updatedPhotos = existingPhotos.map((photo: string, idx: number) => {
          if (!photo.startsWith("http")) return photo
          const urlIdx = job.urls.indexOf(photo)
          if (urlIdx !== -1 && processedKeys[urlIdx]) {
            return processedKeys[urlIdx]
          }
          return photo
        })

        await db
          .update(dogs)
          .set({ photos: updatedPhotos, updatedAt: new Date() })
          .where(eq(dogs.id, job.dogId))
      },
      catch: (e) => new DatabaseError({ operation: "update dog photos", cause: e }),
    })

    yield* Effect.logInfo(
      `Processed ${processedKeys.length} photos for dog ${job.dogId}`
    )
  }

  message.ack()
})

const handleImageJob = (message: Message<ImageJob>, env: ImageEnv) =>
  handleImageJobBase(message, env).pipe(
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        yield* Effect.logError(`Image processing failed: ${error}`)
        message.retry()
      })
    )
  )

const processImage = Effect.fn("scraper.processImage")(function* (
  url: string,
  dogId: string,
  env: ImageEnv
) {
  const hash = yield* Effect.promise(() => sha256Short(url))
  const baseKey = `dogs/${dogId}/${hash}`

  const exists = yield* Effect.tryPromise(() =>
    env.PHOTOS_ORIGINAL.head(`${baseKey}-lg.webp`)
  ).pipe(
    Effect.map((obj) => obj !== null),
    Effect.catchAll(() => Effect.succeed(false))
  )

  if (exists) {
    yield* Effect.logDebug(`Image already processed: ${baseKey}`)
    return baseKey
  }

  const response = yield* Effect.tryPromise({
    try: () =>
      fetch(url, { headers: { "User-Agent": "Mozilla/5.0 Dogpile Bot" } }),
    catch: (e) => new HttpError({ url, status: 0, message: String(e) }),
  })

  if (!response.ok) {
    return yield* new HttpError({
      url,
      status: response.status,
      message: response.statusText,
    })
  }

  const buffer = yield* Effect.tryPromise({
    try: () => response.arrayBuffer(),
    catch: (e) =>
      new HttpError({
        url,
        status: response.status,
        message: `Failed to read response: ${e}`,
      }),
  })

  yield* Effect.all([
    transformAndUpload(buffer, baseKey, "sm", env),
    transformAndUpload(buffer, baseKey, "lg", env),
  ])

  return baseKey
})

const transformAndUpload = Effect.fn("scraper.transformAndUpload")(function* (
  buffer: ArrayBuffer,
  baseKey: string,
  size: "sm" | "lg",
  env: ImageEnv
) {
  return yield* Effect.tryPromise({
    try: async () => {
      const { width, quality } = IMAGE_SIZES[size]
      const key = `${baseKey}-${size}.webp`

      const output = await env.IMAGES.input(buffer)
        .transform({ width, quality })
        .output({ format: "image/webp" })

      const transformed = await output.response().arrayBuffer()
      await env.PHOTOS_ORIGINAL.put(key, transformed, {
        httpMetadata: { contentType: "image/webp" },
      })
    },
    catch: (e) =>
      new ImageHandlerError({
        operation: `transform and upload ${size}`,
        cause: e,
      }),
  })
})
