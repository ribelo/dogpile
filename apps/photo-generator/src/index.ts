import { Effect } from "effect"
import type { PhotosGenerateJob } from "@dogpile/core/queues"

interface Env {
  DB: D1Database
  PHOTOS_GENERATED: R2Bucket
  IMAGES: ImagesBinding
  OPENROUTER_API_KEY: string
  MODEL_IMAGE_GEN: string
}

const isPhotosGenerateJob = (body: unknown): body is PhotosGenerateJob => {
  if (typeof body !== "object" || body === null) {
    return false
  }

  if (!("type" in body) || (body as { type?: unknown }).type !== "photos.generate") {
    return false
  }

  if (!("payload" in body) || typeof (body as { payload?: unknown }).payload !== "object" || (body as { payload?: unknown }).payload === null) {
    return false
  }

  const payload = (body as { payload: { dogId?: unknown; variant?: unknown } }).payload
  return typeof payload.dogId === "string" && typeof payload.variant === "string"
}

export default {
  async queue(
    batch: MessageBatch<unknown>,
    _env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const program = Effect.gen(function* () {
      for (const message of batch.messages) {
        const body = message.body

        if (!isPhotosGenerateJob(body)) {
          yield* Effect.logWarning(
            `photo-generator: unexpected envelope type: ${String((body as { type?: unknown } | null)?.type)}`
          )
          message.ack()
          continue
        }

        yield* Effect.logInfo(
          `photo-generator: received photos.generate (traceId=${body.traceId} dogId=${body.payload.dogId} variant=${body.payload.variant})`
        )

        message.ack()
      }
    })

    ctx.waitUntil(Effect.runPromise(program))
  },
}
