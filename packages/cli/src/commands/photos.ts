import { Command, Options } from "@effect/cli"
import { Console, Effect, Layer, Queue, Fiber, Chunk, Schedule, Context, Option } from "effect"
import { Database } from "bun:sqlite"
import { globSync } from "glob"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { $ } from "bun"
import { writeFileSync, unlinkSync, mkdirSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import {
  ImageGenerator,
  OpenRouterClient,
  RateLimitError,
  NetworkError,
  OpenRouterError,
} from "@dogpile/core/services"
import { aiConfig, type AIConfig } from "@dogpile/core/config/ai"
import { FetchHttpClient } from "@effect/platform"
import { R2Error, SharpError, UnrecoverableError } from "../errors"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, "../../../..")
const CONFIG_PATH = path.join(REPO_ROOT, "apps/api/wrangler.toml")

const isRetryableError = (error: unknown): boolean => {
  if (error instanceof RateLimitError) return true
  if (error instanceof NetworkError) return true
  if (error instanceof OpenRouterError) {
    const retryableCodes = [408, 429, 500, 502, 503]
    return retryableCodes.includes(error.status)
  }
  return false
}

const isUnrecoverableError = (error: unknown): { stop: boolean; reason: string } | null => {
  if (error instanceof OpenRouterError) {
    if (error.status === 402) return { stop: true, reason: "Insufficient credits on OpenRouter" }
    if (error.status === 401) return { stop: true, reason: "Invalid API credentials" }
  }
  return null
}

const findLocalDb = () => Effect.gen(function* () {
  const pattern = path.join(REPO_ROOT, "apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite")
  const paths = globSync(pattern)
  const dbPaths = paths.filter(p => !p.endsWith("-shm") && !p.endsWith("-wal"))
  if (dbPaths.length === 0) {
    return yield* new UnrecoverableError({ reason: "Local SQLite DB not found. Run 'wrangler d1 migrations apply dogpile-db --local' in apps/api first." })
  }
  return dbPaths[0]
})

const R2_GENERATED_BLOBS_PATH = path.join(REPO_ROOT, "apps/api/.wrangler/state/v3/r2/dogpile-generated/blobs")

const statusCommand = Command.make("status", {}, () =>
  Effect.gen(function* () {
    const dbPath = yield* findLocalDb()
    const db = new Database(dbPath, { readonly: true })

    const stats = db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN photos_generated != '[]' AND photos_generated IS NOT NULL THEN 1 ELSE 0 END) as with_photos,
        SUM(CASE WHEN photos_generated = '[]' OR photos_generated IS NULL THEN 1 ELSE 0 END) as without_photos
      FROM dogs
    `).get() as { total: number; with_photos: number; without_photos: number }

    db.close()

    let blobCount = 0
    try {
      const blobs = globSync(path.join(R2_GENERATED_BLOBS_PATH, "*"))
      blobCount = blobs.length
    } catch (e) {
      // Directory might not exist yet
    }

    yield* Console.log("\n📷 Photo Generation Status")
    yield* Console.log("--------------------------")
    yield* Console.log(`Total dogs:           ${stats.total}`)
    yield* Console.log(`With photos:          ${stats.with_photos}`)
    yield* Console.log(`Without photos:       ${stats.without_photos}`)
    yield* Console.log(`Local R2 blobs:       ${blobCount}`)
    yield* Console.log("")
  })
)

const clearCommand = Command.make("clear", {}, () =>
  Effect.gen(function* () {
    const dbPath = yield* findLocalDb()
    const db = new Database(dbPath)

    const result = db.run("UPDATE dogs SET photos_generated = '[]'")
    db.close()

    let deletedFiles = 0
    try {
      if (readdirSync(R2_GENERATED_BLOBS_PATH).length > 0) {
        const files = globSync(path.join(R2_GENERATED_BLOBS_PATH, "*"))
        for (const file of files) {
          rmSync(file)
          deletedFiles++
        }
      }
    } catch (e) {
      // Directory might not exist
    }

    yield* Console.log(`\n✅ Cleared ${result.changes} dogs in D1 and ${deletedFiles} blobs in local R2.\n`)
  })
)

const uploadToR2 = (sharp: any, base64Data: string, fingerprint: string, type: "professional" | "nose") =>
  Effect.gen(function* () {
    const data = base64Data.replace(/^data:image\/\w+;base64,/, "")
    const buffer = Buffer.from(data, "base64")

    const sizes = [
      { name: "lg", width: 1024, height: 1280 },
      { name: "sm", width: 512, height: 640 },
    ]

    const baseKey = `${fingerprint}-${type}`

    for (const size of sizes) {
      const optimized = yield* Effect.tryPromise({
        try: () => sharp(buffer)
          .resize(size.width, size.height, { fit: "cover" })
          .webp({ quality: 85 })
          .toBuffer(),
        catch: (e) => new SharpError({ operation: "resize/webp", cause: e })
      })

      const tmpPath = path.join(tmpdir(), `dogpile-${Date.now()}-${size.name}.webp`)
      writeFileSync(tmpPath, optimized as Buffer)

      const r2Key = `dogpile-generated/${baseKey}-${size.name}.webp`
      
      yield* Effect.tryPromise({
        try: async () => {
          const result = await $`wrangler r2 object put ${r2Key} --file ${tmpPath} --content-type image/webp --config ${CONFIG_PATH} --local`.quiet()
          if (result.exitCode !== 0) {
            throw new R2Error({ operation: "put", message: result.stderr.toString() })
          }
        },
        catch: (e) => e instanceof R2Error ? e : new R2Error({ operation: "put", message: String(e), cause: e })
      })

      unlinkSync(tmpPath)
    }

    return `generated/${baseKey}`
  })

const generateCommand = Command.make("generate", {
  concurrency: Options.integer("concurrency").pipe(Options.withDefault(5)),
  limit: Options.optional(Options.integer("limit")),
}, ({ concurrency, limit }) =>
  Effect.gen(function* () {
    const sharp = (yield* Effect.tryPromise(() => import("sharp"))).default
    const dbPath = yield* findLocalDb()
    const db = new Database(dbPath)

    let query = "SELECT id, name, fingerprint, photos, generated_bio FROM dogs WHERE photos_generated = '[]' OR photos_generated IS NULL"
    if (Option.isSome(limit)) {
      query += ` LIMIT ${limit.value}`
    }

    const dogs = db.query(query).all() as {
      id: string
      name: string
      fingerprint: string
      photos: string
      generated_bio: string
    }[]

    if (dogs.length === 0) {
      yield* Console.log("No dogs missing photos found.")
      db.close()
      return
    }

    yield* Console.log(`Generating photos for ${dogs.length} dogs (concurrency: ${concurrency})...`)

    const retrySchedule = Schedule.exponential("1 second").pipe(
      Schedule.union(Schedule.spaced("500 millis")),
      Schedule.intersect(Schedule.recurs(3)) // max 3 retries
    )

    const imageGenerator = yield* ImageGenerator

    const processDog = (dog: typeof dogs[0], index: number) =>
      Effect.gen(function* () {
        yield* Console.log(`[${index + 1}/${dogs.length}] Processing ${dog.name} (${dog.fingerprint})...`)

        const photos = JSON.parse(dog.photos) as string[]
        if (photos.length === 0) {
          yield* Console.log(`  ⚠️ Skipping ${dog.name}: no reference photo`)
          return
        }

        const result = yield* imageGenerator
          .generatePhotos({
            dogDescription: dog.generated_bio,
            referencePhotoUrl: photos[0],
          })
          .pipe(
            Effect.retry({
              schedule: retrySchedule,
              while: (error) => isRetryableError(error),
            }),
            Effect.catchAll((e) => 
              Effect.gen(function* () {
                const unrecoverable = isUnrecoverableError(e)
                if (unrecoverable) {
                  // This will bubble up and stop the whole process
                  return yield* new UnrecoverableError({ reason: unrecoverable.reason })
                }
                const message = e instanceof Error ? e.message : String(e)
                yield* Console.log(`  ❌ Failed image generation for ${dog.name}: ${message}`)
                return null
              })
            )
         )

        if (!result) {
          yield* Console.log(`  ⚠️ No photos generated for ${dog.name} (model returned empty)`)
          return
        }

       const generatedKeys: string[] = []

        if (result.professional) {
          const key = yield* uploadToR2(sharp, result.professional.base64Url, dog.fingerprint, "professional").pipe(
            Effect.catchAll(e => {
               const message = e instanceof Error ? e.message : String(e)
               return Console.log(`  ❌ Failed professional upload for ${dog.name}: ${message}`).pipe(Effect.map(() => null))
            })
          )
          if (key) generatedKeys.push(key)
        }

        if (result.funNose) {
          const key = yield* uploadToR2(sharp, result.funNose.base64Url, dog.fingerprint, "nose").pipe(
            Effect.catchAll(e => {
               const message = e instanceof Error ? e.message : String(e)
               return Console.log(`  ❌ Failed nose upload for ${dog.name}: ${message}`).pipe(Effect.map(() => null))
            })
          )
          if (key) generatedKeys.push(key)
        }

        if (generatedKeys.length > 0) {
          db.run("UPDATE dogs SET photos_generated = ? WHERE id = ?", [JSON.stringify(generatedKeys), dog.id])
          yield* Console.log(`  ✅ Generated ${generatedKeys.length} photos for ${dog.name}`)
        }
      })

    yield* Effect.forEach(dogs, (dog, i) => processDog(dog, i), { concurrency })

    db.close()
    yield* Console.log("\n✨ Photo generation complete.\n")
  }).pipe(
    Effect.provide(
      Layer.provide(ImageGenerator.Live, OpenRouterClient.Live).pipe(
        Layer.merge(FetchHttpClient.layer)
      )
    ),
    Effect.mapError(e => {
      if (e instanceof UnrecoverableError) return e
      return new UnrecoverableError({ reason: String(e) })
    })
  )
)

export const photosCommand = Command.make("photos", {}).pipe(
  Command.withSubcommands([statusCommand, clearCommand, generateCommand])
)
