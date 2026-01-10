#!/usr/bin/env bun
import { Effect, Console, Exit, Cause, Layer, Queue, Fiber, Chunk, Schedule, Option } from "effect"
import { Schema } from "effect"
import { FetchHttpClient } from "@effect/platform"
import { getAdapter, listAdapters } from "./registry.js"
import type { RawDogData } from "./adapter.js"
import { $ } from "bun"
import { writeFileSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"


class R2Error extends Schema.TaggedError<R2Error>()("R2Error", {
  operation: Schema.String,
  key: Schema.String,
  message: Schema.String,
}) {}

class DatabaseError extends Schema.TaggedError<DatabaseError>()("DatabaseError", {
  operation: Schema.String,
  cause: Schema.Defect,
}) {}

class CliError extends Schema.TaggedError<CliError>()("CliError", {
  command: Schema.String,
  message: Schema.String,
}) {}

// Photo key format: "generated/{fingerprint}-{type}" where type is "professional" or "nose"
// R2 stores: "{fingerprint}-{type}-{size}.webp" where size is "sm" or "lg"
// Frontend appends "-{size}.webp" when constructing URLs
const toPhotoKey = (baseKey: string): string => `generated/${baseKey}`

// Import core services
import {
  OpenRouterClient,
  TextExtractor,
  PhotoAnalyzer,
  DescriptionGenerator,
  EmbeddingService,
  ImageGenerator,
  SearchDocumentBuilder,
  SearchDocumentBuilderLive,
} from "@dogpile/core/services"

interface ParsedArgs {
  command: string | null
  commandArg: string | null
  subCommand: string | null
  flags: Map<string, string | boolean>
}

const parseArgs = (argv: string[]): ParsedArgs => {
  const flags = new Map<string, string | boolean>()
  let command: string | null = null
  let commandArg: string | null = null
  let subCommand: string | null = null

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith("--")) {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith("-")) {
        flags.set(key, next)
        i++
      } else {
        flags.set(key, true)
      }
    } else if (!command) {
      command = arg
    } else if (!commandArg) {
      if (command === "photos") {
        subCommand = arg
      } else {
        commandArg = arg
      }
    } else if (!subCommand) {
      subCommand = arg
    }
  }

  return { command, commandArg, subCommand, flags }
}

const getIntFlag = (flags: Map<string, string | boolean>, key: string, defaultVal: number): number => {
  const val = flags.get(key)
  if (typeof val === "string") {
    const parsed = parseInt(val, 10)
    return isNaN(parsed) ? defaultVal : parsed
  }
  return defaultVal
}

const getBoolFlag = (flags: Map<string, string | boolean>, key: string): boolean => 
  flags.get(key) === true

const parsed = parseArgs(process.argv.slice(2))
const command = parsed.command

const printUsage = Effect.gen(function* () {
  yield* Console.log(`
Dogpile Scraper CLI

Usage:
  bun run cli <command> [subcommand] [options]

Commands:
  list                    List all available scrapers
  run <scraper-id>        Run scraper (dry-run by default)
  process <scraper-id>    Full pipeline: scrape + AI + save
  photos <action>           Manage AI generated photos
    status                  Show photo statistics
    generate                Generate missing photos
    reset                   Delete ALL generated photos (requires --force)
  reindex                 Reindex dogs for search

Options:
  --limit <n>             Limit dogs to process
  --json                  Output raw JSON
  --save                  Save to DB (for run command)
  --concurrency <n>       Parallel processing (default 10)
  --generate-photos       Generate AI photos (expensive, disabled by default)
  --force                   Bypass safety checks or overwrite
  --missing-only            For generate: only dogs without photos (default true)
  --id <id>                 Process specific dog ID

Examples:
  bun run cli list
  bun run cli run tozjawor
  bun run cli process tozjawor --limit 2
  bun run cli reindex --limit 10
`)
})

const listCommand = Effect.gen(function* () {
  const adapters = listAdapters()
  yield* Console.log("\nAvailable scrapers:\n")
  yield* Effect.forEach(adapters, (adapter) =>
    Console.log(`  ${adapter.id.padEnd(20)} ${adapter.name}`)
  )
  yield* Console.log("")
})

const formatDog = (dog: RawDogData, index: number): string => {
  const desc = (dog.rawDescription ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)
  return `[${index + 1}] ${dog.name} (${dog.sex ?? "?"}) - ${desc}...`
}

const execSql = (sql: string) =>
  Effect.tryPromise({
    try: async () => {
      const result = await $`wrangler d1 execute dogpile-db --local --config ../../apps/api/wrangler.toml --command ${sql}`.quiet()
      if (result.exitCode !== 0) {
        throw new DatabaseError({ operation: "execute", cause: result.stderr.toString() })
      }
      return result
    },
    catch: (e) => (e instanceof DatabaseError ? e : new DatabaseError({ operation: "execute", cause: e }))
  })

const deleteFromR2 = (baseKey: string) =>
  Effect.gen(function* () {
    const smKey = `dogpile-generated/${baseKey}-sm.webp`
    const lgKey = `dogpile-generated/${baseKey}-lg.webp`
    yield* Effect.tryPromise({
      try: async () => {
         await $`wrangler r2 object delete ${smKey} --config ../../apps/api/wrangler.toml`.quiet().nothrow()
         await $`wrangler r2 object delete ${lgKey} --config ../../apps/api/wrangler.toml`.quiet().nothrow()
      },
      catch: () => {}
    })
  })


const verifyR2ObjectExists = (baseKey: string): Effect.Effect<boolean, never, never> =>
  Effect.tryPromise({
    try: async () => {
      const lgKey = `dogpile-generated/${baseKey}-lg.webp`
      const result = await $`wrangler r2 object get ${lgKey} --config ../../apps/api/wrangler.toml --pipe`.quiet().nothrow()
      return result.exitCode === 0
    },
    catch: () => false
  }).pipe(Effect.catchAll(() => Effect.succeed(false)))


const uploadToR2WithOptimization = (base64Data: string, baseKey: string) =>
  Effect.gen(function* () {
    const uploaded = yield* Effect.tryPromise({
      try: async () => {
        const data = base64Data.replace(/^data:image\/\w+;base64,/, "")
        const buffer = Buffer.from(data, "base64")

        const [smBuffer, lgBuffer] = await Promise.all([
          sharp(buffer).resize(400).webp({ quality: 80 }).toBuffer(),
          sharp(buffer).resize(1200).webp({ quality: 85 }).toBuffer(),
        ])

        const tmpSm = join(tmpdir(), `dogpile-${Date.now()}-sm.webp`)
        const tmpLg = join(tmpdir(), `dogpile-${Date.now()}-lg.webp`)
        writeFileSync(tmpSm, smBuffer)
        writeFileSync(tmpLg, lgBuffer)

        const smKey = `dogpile-generated/${baseKey}-sm.webp`
        const lgKey = `dogpile-generated/${baseKey}-lg.webp`

        const smResult = await $`wrangler r2 object put ${smKey} --file ${tmpSm} --content-type image/webp --config ../../apps/api/wrangler.toml`.nothrow()
        if (smResult.exitCode !== 0) {
          throw new R2Error({ operation: "upload-sm", key: smKey, message: smResult.stderr.toString() })
        }
        const lgResult = await $`wrangler r2 object put ${lgKey} --file ${tmpLg} --content-type image/webp --config ../../apps/api/wrangler.toml`.nothrow()
        if (lgResult.exitCode !== 0) {
          throw new R2Error({ operation: "upload-lg", key: lgKey, message: lgResult.stderr.toString() })
        }

        unlinkSync(tmpSm)
        unlinkSync(tmpLg)

        return baseKey
      },
      catch: (e) => (e instanceof R2Error ? e : new R2Error({ operation: "upload", key: baseKey, message: String(e) }))
    })


    // Verify upload succeeded by checking object exists
    const exists = yield* verifyR2ObjectExists(uploaded)
    if (!exists) {
      return yield* Effect.fail(new R2Error({ operation: "verify", key: uploaded, message: "object not found after upload" }))
    }

    return uploaded
  })

const runCommand = (scraperId: string) =>
  Effect.gen(function* () {
    const limit = getIntFlag(parsed.flags, "limit", 5)
    const jsonOutput = getBoolFlag(parsed.flags, "json")
    const saveToDb = getBoolFlag(parsed.flags, "save")

    const adapter = getAdapter(scraperId)
    if (!adapter) {
      yield* Console.error(`Unknown scraper: ${scraperId}`)
      return
    }

    yield* Console.log(`\n🐕 Running: ${adapter.name}`)
    const config = { shelterId: scraperId, baseUrl: "" }

    yield* Console.log("📡 Fetching...")
    const html = yield* adapter.fetch(config)
    const rawDogs = yield* adapter.parse(html, config)
    yield* Console.log(`   Found ${rawDogs.length} dogs\n`)

    if (jsonOutput) {
      yield* Console.log(JSON.stringify(rawDogs.slice(0, limit), null, 2))
    } else if (!saveToDb) {
      yield* Effect.forEach(rawDogs.slice(0, limit), (dog, i) =>
        Console.log(formatDog(dog, i))
      )
    }

    if (saveToDb) {
      yield* Console.log(`💾 Saving...`)
      const esc = (s: string | null | undefined) => (s ?? "").replace(/'/g, "''")
      const now = Date.now()
      const shelterSql = `INSERT INTO shelters (id, slug, name, url, city, status, last_sync) VALUES ('${esc(scraperId)}', '${esc(scraperId)}', '${esc(adapter.name)}', '${esc(adapter.url)}', '${esc(adapter.city)}', 'active', ${now}) ON CONFLICT(id) DO UPDATE SET name = excluded.name, last_sync = excluded.last_sync`
      yield* execSql(shelterSql)

      yield* Effect.forEach(rawDogs, (dog) =>
        Effect.gen(function* () {
          const sql = `INSERT INTO dogs (id, shelter_id, external_id, name, sex, raw_description, photos, fingerprint, status, urgent, created_at, updated_at, last_seen_at, source_url, breed_estimates, personality_tags) VALUES ('${crypto.randomUUID()}', '${esc(scraperId)}', '${esc(dog.externalId)}', '${esc(dog.name)}', '${esc(dog.sex ?? "unknown")}', '${esc(dog.rawDescription)}', '${esc(JSON.stringify(dog.photos ?? []))}', '${esc(dog.fingerprint)}', 'available', ${dog.urgent ? 1 : 0}, ${now}, ${now}, ${now}, '${esc(dog.sourceUrl ?? adapter.sourceUrl)}', '[]', '[]') ON CONFLICT(fingerprint) DO UPDATE SET updated_at = ${now}, last_seen_at = ${now}, source_url = excluded.source_url, raw_description = excluded.raw_description, photos = excluded.photos, name = CASE WHEN excluded.name != '' THEN excluded.name ELSE dogs.name END, sex = CASE WHEN excluded.sex != 'unknown' THEN excluded.sex ELSE dogs.sex END`
          yield* execSql(sql)
        })
      )
      yield* execSql(`UPDATE shelters SET last_sync = ${now}, status = 'active' WHERE id = '${esc(scraperId)}'`)
      yield* Console.log(`   ✓ Saved ${rawDogs.length} dogs`)
    }
    yield* Console.log(`\n✅ Done.`)
  })

const processCommand = (scraperId: string) =>
  Effect.gen(function* () {
    const limitArg = getIntFlag(parsed.flags, "limit", 999)
    const concurrency = Math.min(60, Math.max(1, getIntFlag(parsed.flags, "concurrency", 10)))
    const generatePhotos = getBoolFlag(parsed.flags, "generate-photos")

    const adapter = getAdapter(scraperId)
    if (!adapter) {
      yield* Console.error(`Unknown scraper: ${scraperId}`)
      return
    }

    yield* Console.log(`\n🐕 Processing: ${adapter.name}`)
    yield* Console.log(`   Pipeline: scrape → AI text → AI photo → generate bio${generatePhotos ? " → generate photos" : ""} → save\n`)
    yield* Console.log(`   Concurrency: ${concurrency}`)

    const config = { shelterId: scraperId, baseUrl: "" }

    // Step 1: Scrape
    yield* Console.log("📡 Fetching...")
    const html = yield* adapter.fetch(config)
    const rawDogs = yield* adapter.parse(html, config)
    const dogsToProcess = rawDogs.slice(0, limitArg)
    yield* Console.log(`   Found ${rawDogs.length}, processing ${dogsToProcess.length}\n`)

    const esc = (s: string | null | undefined) => (s ?? "").replace(/'/g, "''")

    // 1. Create queue for SQL operations
    const sqlQueue = yield* Queue.bounded<string | null>(100)

    // 2. Spawn writer fiber
    const writerFiber = yield* Effect.gen(function* () {
      while (true) {
        const batch = yield* Queue.takeBetween(sqlQueue, 1, 10)
        const activeItems = Chunk.filter(batch, (item): item is string => item !== null)
        const shouldStop = batch.length !== activeItems.length

        if (activeItems.length > 0) {
          const combinedSql = Array.from(activeItems).join("; ")
          yield* execSql(`BEGIN TRANSACTION; ${combinedSql}; COMMIT;`).pipe(
            Effect.retry(Schedule.recurs(3).pipe(Schedule.addDelay(() => "500 millis"))),
            Effect.catchAll(e => Console.error(`Batch write failed after retries: ${e}`))
          )
          yield* Console.log(`   💾 Saved batch of ${activeItems.length}`)
        }

        if (shouldStop) break
      }
    }).pipe(Effect.fork)

    // Get services
    const textExtractor = yield* TextExtractor
    const photoAnalyzer = yield* PhotoAnalyzer
    const descGenerator = yield* DescriptionGenerator
    const embeddingService = yield* EmbeddingService
    const imageGenerator = yield* ImageGenerator

    yield* Console.log("🤖 AI Processing...")
    const now = Date.now()

    // Step 2: Ensure shelter
    const shelterSql = `INSERT INTO shelters (id, slug, name, url, city, status, last_sync) VALUES ('${esc(scraperId)}', '${esc(scraperId)}', '${esc(adapter.name)}', '${esc(adapter.url)}', '${esc(adapter.city)}', 'active', ${now}) ON CONFLICT(id) DO UPDATE SET name = excluded.name, last_sync = excluded.last_sync`
    yield* sqlQueue.offer(shelterSql)

    const processDog = (dog: RawDogData, i: number) =>
      Effect.gen(function* () {
        yield* Console.log(`\n[${i + 1}/${dogsToProcess.length}] ${dog.name}`)

        // Text extraction with shelter context
        yield* Console.log(`   📝 Text extraction...`)
        const textResult = yield* textExtractor.extract(dog.rawDescription ?? "", {
          name: adapter.name,
          city: adapter.city,
        }).pipe(
          Effect.catchAll((e) => {
            console.log(`   ⚠️ Failed: ${e.message}`)
            return Effect.succeed(null)
          })

        )
        if (textResult) {
          yield* Console.log(`      ✓ Breeds: ${textResult.breedEstimates.map(b => b.breed).join(", ") || "none"}`)
        }

        // Photo analysis
        let photoResult = null
        if (dog.photos && dog.photos.length > 0) {
          yield* Console.log(`   📷 Photo analysis (${dog.photos.length})...`)
          photoResult = yield* photoAnalyzer.analyzeMultiple(dog.photos).pipe(
            Effect.catchAll((e) => {
              console.log(`   ⚠️ Failed: ${e.message}`)
              return Effect.succeed(null)
            })

          )
          if (photoResult) {
            yield* Console.log(`      ✓ Colors: ${photoResult.colorPrimary ?? "?"}, fur: ${photoResult.furLength ?? "?"}`)
          }
        }

        // Bio generation
        yield* Console.log(`   ✍️ Generating bio...`)
        const bioInput = {
          name: dog.name,
          sex: textResult?.sex ?? dog.sex ?? null,
          breedEstimates: [...(textResult?.breedEstimates ?? []), ...(photoResult?.breedEstimates ?? [])].slice(0, 3),
          ageMonths: textResult?.ageEstimate?.months ?? null,
          size: textResult?.sizeEstimate?.value ?? photoResult?.sizeEstimate?.value ?? null,
          personalityTags: textResult?.personalityTags ?? [],
          goodWithKids: textResult?.goodWithKids ?? null,
          goodWithDogs: textResult?.goodWithDogs ?? null,
          goodWithCats: textResult?.goodWithCats ?? null,
          healthInfo: {
            vaccinated: textResult?.vaccinated ?? null,
            sterilized: textResult?.sterilized ?? null,
          },
        }
        const bio = yield* descGenerator.generate(bioInput).pipe(
          Effect.catchAll((e) => {
            console.log(`   ⚠️ Failed: ${e.message}`)
            return Effect.succeed(null)
          })

        )


        // Generate embedding for search (verify API works, storage via queue)
        if (bio?.bio) {
          yield* Console.log(`   🔢 Generating embedding...`)
          const vector = yield* embeddingService.embed(bio.bio).pipe(
            Effect.catchAll((e) => {
              console.log(`   ⚠️ Embedding failed: ${e.message}`)
              return Effect.succeed(null)
            })

          )
          if (vector) {
            yield* Console.log(`      ✓ Vector dim: ${vector.length}`)
          }
        }

        // Generate fisheye nose photo (optional, expensive)
        const generatedPhotoUrls: string[] = []
        if (bio?.bio && generatePhotos) {
          yield* Console.log(`   🎨 Generating AI photos...`)
          const imgResult = yield* imageGenerator.generatePhotos({ dogDescription: bio.bio, referencePhotoUrl: dog.photos?.[0] }).pipe(
            Effect.catchAll((e) => {
              console.log(`   ⚠️ Image gen failed: ${e.message}`)
              return Effect.succeed(null)
            })

          )
          if (imgResult?.professional) {
            const r2Key = `${dog.fingerprint}-professional`
            yield* Console.log(`   ☁️ Uploading professional photo to R2...`)
            const uploadedKey = yield* uploadToR2WithOptimization(imgResult.professional.base64Url, r2Key).pipe(
              Effect.catchAll((e) => {
                console.log(`   ⚠️ R2 upload failed: ${e.message}`)
                return Effect.succeed(null)
              })

            )
            if (uploadedKey) {
              generatedPhotoUrls.push(toPhotoKey(uploadedKey))
              yield* Console.log(`      ✓ Uploaded: ${uploadedKey}`)
            }
          }
          if (imgResult?.funNose) {
            const r2Key = `${dog.fingerprint}-nose`
            yield* Console.log(`   ☁️ Uploading fun nose photo to R2...`)
            const uploadedKey = yield* uploadToR2WithOptimization(imgResult.funNose.base64Url, r2Key).pipe(
              Effect.catchAll((e) => {
                console.log(`   ⚠️ R2 upload failed: ${e.message}`)
                return Effect.succeed(null)
              })

            )
            if (uploadedKey) {
              generatedPhotoUrls.push(toPhotoKey(uploadedKey))
              yield* Console.log(`      ✓ Uploaded: ${uploadedKey}`)
            }
          }
        }


        // Save to DB
        const id = crypto.randomUUID()
        const breedEstimates = JSON.stringify([...(textResult?.breedEstimates ?? []), ...(photoResult?.breedEstimates ?? [])].slice(0, 5))
        const personalityTags = JSON.stringify(textResult?.personalityTags ?? [])
        const sizeEstimate = textResult?.sizeEstimate ?? photoResult?.sizeEstimate ?? null
        const ageEstimate = textResult?.ageEstimate ?? null
        const weightEstimate = textResult?.weightEstimate ?? null

        const sizeEstimateSql = sizeEstimate === null ? "NULL" : `'${esc(JSON.stringify(sizeEstimate))}'`
        const ageEstimateSql = ageEstimate === null ? "NULL" : `'${esc(JSON.stringify(ageEstimate))}'`
        const weightEstimateSql = weightEstimate === null ? "NULL" : `'${esc(JSON.stringify(weightEstimate))}'`

        const isFosterSql =
          textResult?.locationHints?.isFoster === undefined
            ? "NULL"
            : textResult.locationHints.isFoster
              ? 1
              : 0

        const sql = `
          INSERT INTO dogs (
            id, shelter_id, external_id, name, sex, raw_description, photos, fingerprint,
            status, urgent, created_at, updated_at, last_seen_at, source_url,
            breed_estimates, personality_tags, size_estimate, age_estimate, weight_estimate,
            location_city, is_foster, vaccinated, sterilized, chipped,
            good_with_kids, good_with_dogs, good_with_cats,
            fur_length, fur_type, color_primary, color_secondary, color_pattern,
            ear_type, tail_type, generated_bio, photos_generated
          ) VALUES (
            '${id}', '${esc(scraperId)}', '${esc(dog.externalId)}', '${esc(dog.name)}',
            '${esc(textResult?.sex ?? dog.sex ?? "unknown")}',
            '${esc(dog.rawDescription)}',
            '${esc(JSON.stringify(dog.photos ?? []))}',
            '${esc(dog.fingerprint)}', 'available',
            ${textResult?.urgent ? 1 : 0}, ${now}, ${now}, ${now}, '${esc(dog.sourceUrl ?? adapter.sourceUrl)}',
            '${esc(breedEstimates)}', '${esc(personalityTags)}',
            ${sizeEstimateSql}, ${ageEstimateSql}, ${weightEstimateSql},
            ${textResult?.locationHints?.cityMention ? `'${esc(textResult.locationHints.cityMention)}'` : `'${esc(adapter.city)}'`},
            ${isFosterSql},
            ${textResult?.vaccinated !== null && textResult?.vaccinated !== undefined ? (textResult.vaccinated ? 1 : 0) : 'NULL'},
            ${textResult?.sterilized !== null && textResult?.sterilized !== undefined ? (textResult.sterilized ? 1 : 0) : 'NULL'},
            ${textResult?.chipped !== null && textResult?.chipped !== undefined ? (textResult.chipped ? 1 : 0) : 'NULL'},
            ${textResult?.goodWithKids !== null && textResult?.goodWithKids !== undefined ? (textResult.goodWithKids ? 1 : 0) : 'NULL'},
            ${textResult?.goodWithDogs !== null && textResult?.goodWithDogs !== undefined ? (textResult.goodWithDogs ? 1 : 0) : 'NULL'},
            ${textResult?.goodWithCats !== null && textResult?.goodWithCats !== undefined ? (textResult.goodWithCats ? 1 : 0) : 'NULL'},
            ${photoResult?.furLength ? `'${esc(photoResult.furLength)}'` : 'NULL'},
            ${photoResult?.furType ? `'${esc(photoResult.furType)}'` : 'NULL'},
            ${photoResult?.colorPrimary ? `'${esc(photoResult.colorPrimary)}'` : 'NULL'},
            ${photoResult?.colorSecondary ? `'${esc(photoResult.colorSecondary)}'` : 'NULL'},
            ${photoResult?.colorPattern ? `'${esc(photoResult.colorPattern)}'` : 'NULL'},
            ${photoResult?.earType ? `'${esc(photoResult.earType)}'` : 'NULL'},
            ${photoResult?.tailType ? `'${esc(photoResult.tailType)}'` : 'NULL'},
            '${esc(bio?.bio ?? "")}',
            '${esc(JSON.stringify(generatedPhotoUrls))}'
          ) ON CONFLICT(fingerprint) DO UPDATE SET
            updated_at = ${now}, last_seen_at = ${now},
            source_url = excluded.source_url,
            raw_description = excluded.raw_description,
            photos = excluded.photos,
            name = CASE WHEN excluded.name != '' THEN excluded.name ELSE dogs.name END,
            sex = CASE WHEN excluded.sex != 'unknown' THEN excluded.sex ELSE dogs.sex END,
            urgent = excluded.urgent,
            breed_estimates = CASE WHEN excluded.breed_estimates != '[]' THEN excluded.breed_estimates ELSE dogs.breed_estimates END,
            personality_tags = CASE WHEN excluded.personality_tags != '[]' THEN excluded.personality_tags ELSE dogs.personality_tags END,
            size_estimate = COALESCE(excluded.size_estimate, dogs.size_estimate),
            age_estimate = COALESCE(excluded.age_estimate, dogs.age_estimate),
            weight_estimate = COALESCE(excluded.weight_estimate, dogs.weight_estimate),
            location_city = COALESCE(excluded.location_city, dogs.location_city),
            is_foster = COALESCE(excluded.is_foster, dogs.is_foster),
            vaccinated = COALESCE(excluded.vaccinated, dogs.vaccinated),
            sterilized = COALESCE(excluded.sterilized, dogs.sterilized),
            chipped = COALESCE(excluded.chipped, dogs.chipped),
            good_with_kids = COALESCE(excluded.good_with_kids, dogs.good_with_kids),
            good_with_dogs = COALESCE(excluded.good_with_dogs, dogs.good_with_dogs),
            good_with_cats = COALESCE(excluded.good_with_cats, dogs.good_with_cats),
            fur_length = COALESCE(excluded.fur_length, dogs.fur_length),
            fur_type = COALESCE(excluded.fur_type, dogs.fur_type),
            color_primary = COALESCE(excluded.color_primary, dogs.color_primary),
            color_secondary = COALESCE(excluded.color_secondary, dogs.color_secondary),
            color_pattern = COALESCE(excluded.color_pattern, dogs.color_pattern),
            ear_type = COALESCE(excluded.ear_type, dogs.ear_type),
            tail_type = COALESCE(excluded.tail_type, dogs.tail_type),
            generated_bio = CASE WHEN excluded.generated_bio != '' THEN excluded.generated_bio ELSE dogs.generated_bio END,
            photos_generated = CASE WHEN excluded.photos_generated != '[]' THEN excluded.photos_generated ELSE dogs.photos_generated END
        `
        yield* sqlQueue.offer(sql)
      })


    yield* Effect.forEach(
      dogsToProcess,
      (dog, i) => processDog(dog, i),
      { concurrency }
    )

    // 4. Close queue and wait for writer
    yield* sqlQueue.offer(null)
    yield* Fiber.join(writerFiber)

    yield* execSql(`UPDATE shelters SET last_sync = ${Date.now()}, status = 'active' WHERE id = '${esc(scraperId)}'`)

    yield* Console.log(`\n\n✅ Complete! Processed ${dogsToProcess.length} dogs.`)
  })

const photosStatusCommand = Effect.gen(function* () {
  const result = yield* Effect.tryPromise({
    try: async () => {
      const proc = await $`wrangler d1 execute dogpile-db --local --config ../../apps/api/wrangler.toml --json --command "SELECT COUNT(*) as total, SUM(CASE WHEN photos_generated != '[]' AND photos_generated IS NOT NULL THEN 1 ELSE 0 END) as with_photos FROM dogs"`.quiet()
      return JSON.parse(proc.stdout.toString())
    },
    catch: (e) => (e instanceof DatabaseError ? e : new DatabaseError({ operation: "status", cause: e }))
  })
  const row = result[0]?.results?.[0]
  if (!row) { yield* Console.error("Could not fetch stats"); return }
  const total = row.total
  const withPhotos = row.with_photos
  const missing = total - withPhotos
  yield* Console.log(`\nPhoto Statistics:\n  Total dogs:      ${total}\n  With AI photos:  ${withPhotos}\n  Missing photos:  ${missing}\n`)
})

const photosResetCommand = Effect.gen(function* () {
  const force = getBoolFlag(parsed.flags, "force")
  if (!force) { yield* Console.error("⚠️  Reset requires --force flag. This will DELETE ALL generated photos!"); return }
  yield* Console.log("🔥 resetting photos...")
  const result = yield* Effect.tryPromise({
    try: async () => {
      const proc = await $`wrangler d1 execute dogpile-db --local --config ../../apps/api/wrangler.toml --json --command "SELECT id, name, fingerprint, photos_generated FROM dogs WHERE photos_generated != '[]' AND photos_generated IS NOT NULL"`.quiet()
      return JSON.parse(proc.stdout.toString())
    },
    catch: (e) => (e instanceof DatabaseError ? e : new DatabaseError({ operation: "reset-list", cause: e }))
  })
  const dogs = result[0]?.results ?? []
  
  const sqlQueue = yield* Queue.bounded<string | null>(100)
  const writerFiber = yield* Effect.gen(function* () {
    while (true) {
      const batch = yield* Queue.takeBetween(sqlQueue, 1, 100)
      const activeItems = Chunk.filter(batch, (item): item is string => item !== null)
      if (activeItems.length > 0) {
        const combinedSql = Array.from(activeItems).join("; ")
        yield* execSql(`BEGIN TRANSACTION; ${combinedSql}; COMMIT;`).pipe(Effect.catchAll(e => Console.error(`Batch write failed: ${e}`)))
      }
      if (batch.length !== activeItems.length) break
    }
  }).pipe(Effect.fork)

  yield* Effect.forEach(dogs, (dog: any, i) => Effect.gen(function* () {
    const photos = JSON.parse(dog.photos_generated || "[]") as string[]
    yield* Console.log(`[${i+1}/${dogs.length}] Deleting for ${dog.name}`)
    for (const photo of photos) {
      const baseKey = photo.replace("generated/", "")
      yield* deleteFromR2(baseKey)
    }
    yield* sqlQueue.offer(`UPDATE dogs SET photos_generated = '[]' WHERE id = '${dog.id}'`)
  }), { concurrency: 20 })

  yield* sqlQueue.offer(null)
  yield* Fiber.join(writerFiber)
  yield* Console.log("\n✅ Reset complete.")
})

const photosGenerateCommand = Effect.gen(function* () {
  const limit = getIntFlag(parsed.flags, "limit", 9999)
  const concurrency = Math.min(60, Math.max(1, getIntFlag(parsed.flags, "concurrency", 5)))
  const force = getBoolFlag(parsed.flags, "force")
  const dogId = parsed.flags.get("id")
  const missingOnly = !force && !dogId && (parsed.flags.has("missing-only") ? getBoolFlag(parsed.flags, "missing-only") : true)

  let query = "SELECT id, name, fingerprint, photos, raw_description, generated_bio, photos_generated FROM dogs"
  const conditions = []
  if (dogId) conditions.push(`id = '${dogId}'`)
  else if (missingOnly) conditions.push("photos_generated = '[]' OR photos_generated IS NULL")
  
  if (conditions.length > 0) query += " WHERE " + conditions.join(" AND ")
  query += ` LIMIT ${limit}`

  yield* Console.log(`\n🎨 Generating Photos (Concurrency: ${concurrency}, Missing: ${missingOnly})\n`)
  const result = yield* Effect.tryPromise({
    try: async () => {
      const proc = await $`wrangler d1 execute dogpile-db --local --config ../../apps/api/wrangler.toml --json --command "${query}"`.quiet()
      return JSON.parse(proc.stdout.toString())
    },
    catch: (e) => (e instanceof DatabaseError ? e : new DatabaseError({ operation: "generate-list", cause: e }))
  })
  const dogs = result[0]?.results ?? []
  if (dogs.length === 0) { yield* Console.log("✅ Nothing to do."); return }

  const imageGen = yield* ImageGenerator
  const sqlQueue = yield* Queue.bounded<string | null>(100)
  const writerFiber = yield* Effect.gen(function* () {
    while (true) {
      const batch = yield* Queue.takeBetween(sqlQueue, 1, 10)
      const activeItems = Chunk.filter(batch, (item): item is string => item !== null)
      if (activeItems.length > 0) {
        const combinedSql = Array.from(activeItems).join("; ")
        yield* execSql(`BEGIN TRANSACTION; ${combinedSql}; COMMIT;`).pipe(
          Effect.retry(Schedule.recurs(3).pipe(Schedule.addDelay(() => "500 millis"))),
          Effect.catchAll(e => Console.error(`Batch write failed: ${e}`))
        )
      }
      if (batch.length !== activeItems.length) break
    }
  }).pipe(Effect.fork)

  yield* Effect.forEach(dogs, (dog: any, i) => Effect.gen(function* () {
    yield* Console.log(`[${i+1}/${dogs.length}] ${dog.name}`)

    if (!dogId && !force && dog.photos_generated && dog.photos_generated !== '[]') {
       yield* Console.log(`   ⏭️ Skipping (already has photos)`)
       return
    }
    
    const photos = JSON.parse(dog.photos || "[]") as string[]
    if (photos.length === 0) { yield* Console.log(`   ⚠️ No reference photos`); return }

    let description = dog.generated_bio || ""
    if (description.length < 20) description = (dog.raw_description || "").replace(/<[^>]*>/g, " ").trim()
    if (description.length < 20) description = `${dog.name} is a dog.`

    const imgResult = yield* imageGen.generatePhotos({
      dogDescription: description.slice(0, 1000),
      referencePhotoUrl: photos[0],
    }).pipe(
      Effect.retry(Schedule.recurs(2).pipe(Schedule.addDelay(() => "1 seconds"))),
      Effect.catchAll((e) => {
        console.error(`      ⚠️ Image gen error: ${e}`)
        return Effect.succeed(null)
      })
    )

    const generatedPhotoUrls: string[] = []
    if (imgResult?.professional) {
      const key = yield* uploadToR2WithOptimization(imgResult.professional.base64Url, `${dog.fingerprint}-professional`).pipe(Effect.catchAll(() => Effect.succeed(null)))
      if (key) generatedPhotoUrls.push(toPhotoKey(key))
    }
    if (imgResult?.funNose) {
      const key = yield* uploadToR2WithOptimization(imgResult.funNose.base64Url, `${dog.fingerprint}-nose`).pipe(Effect.catchAll(() => Effect.succeed(null)))
      if (key) generatedPhotoUrls.push(toPhotoKey(key))
    }

    if (generatedPhotoUrls.length > 0) {
      const sql = `UPDATE dogs SET photos_generated = '${JSON.stringify(generatedPhotoUrls).replace(/'/g, "''")}' WHERE id = '${dog.id}'`
      yield* sqlQueue.offer(sql)
      yield* Console.log(`      ✓ Saved ${generatedPhotoUrls.length} photos`)
    } else {
      yield* Console.log(`      ⚠️ Failed`)
    }
  }), { concurrency })

  yield* sqlQueue.offer(null)
  yield* Fiber.join(writerFiber)
  yield* Console.log("\n✅ Generation complete.")
})

const reindexCommand = Effect.gen(function* () {
  const limit = getIntFlag(parsed.flags, "limit", 99999)
  const concurrency = Math.min(60, Math.max(1, getIntFlag(parsed.flags, "concurrency", 10)))

  yield* Console.log(`\n🔍 Reindexing dogs (Limit: ${limit}, Concurrency: ${concurrency})\n`)

  const result = yield* Effect.tryPromise({
    try: async () => {
      const query = `SELECT * FROM dogs WHERE status = 'available' LIMIT ${limit}`
      const proc = await $`wrangler d1 execute dogpile-db --local --config ../../apps/api/wrangler.toml --json --command "${query}"`.quiet()
      return JSON.parse(proc.stdout.toString())
    },
    catch: (e) => new DatabaseError({ operation: "fetch-dogs", cause: e })
  })

  const dogsData = result[0]?.results ?? []
  if (dogsData.length === 0) {
    yield* Console.log("✅ No dogs to reindex.")
    return
  }

  const builder = yield* SearchDocumentBuilder
  const embeddingService = yield* EmbeddingService

  yield* Effect.forEach(dogsData, (dog: any, i) => Effect.gen(function* () {
    yield* Console.log(`[${i + 1}/${dogsData.length}] Reindexing ${dog.name}...`)

    // Parse JSON fields
    const breedEstimates = JSON.parse(dog.breed_estimates || "[]")
    const personalityTags = JSON.parse(dog.personality_tags || "[]")
    const sizeEstimate = JSON.parse(dog.size_estimate || "null")
    const ageEstimate = JSON.parse(dog.age_estimate || "null")

    const doc = yield* builder.build({
      id: dog.id,
      shelterId: dog.shelter_id,
      name: dog.name,
      locationCity: dog.location_city,
      sizeEstimate: sizeEstimate,
      ageEstimate: ageEstimate,
      breedEstimates: breedEstimates,
      personalityTags: personalityTags,
      generatedBio: dog.generated_bio,
      sex: dog.sex,
    })

    yield* Console.log(`   📝 Built doc: ${doc.text.slice(0, 100)}...`)

    const vector = yield* embeddingService.embed(doc.text).pipe(
      Effect.catchAll((e) => {
        console.error(`      ⚠️ Embedding failed: ${e.message}`)
        return Effect.succeed(null)
      })
    )

    if (vector) {
      yield* Console.log(`   🔢 Generated vector (${vector.length} dim)`)
      // Note: Local CLI doesn't have direct Vectorize access easily without wrangler commands
      // We could use wrangler vectorize upsert but it's slow for many items.
      // For now, we'll log it and suggest using the admin endpoint for remote reindexing.
      
      const metadata = JSON.stringify(doc.metadata).replace(/'/g, "''")
      const values = JSON.stringify(vector)
      
      yield* Effect.tryPromise({
        try: async () => {
          const tmpFile = join(tmpdir(), `dogpile-vector-${dog.id}.json`)
          const vectorObj = [{ id: dog.id, values: vector, metadata: doc.metadata }]
          writeFileSync(tmpFile, JSON.stringify(vectorObj))
          const cmd = `wrangler vectorize insert dogpile-dogs --local --config ../../apps/api/wrangler.toml --file ${tmpFile}`
          const result = await $`sh -c "${cmd}"`.quiet().nothrow()
          unlinkSync(tmpFile)
          if (result.exitCode !== 0) {
            throw new Error(result.stderr.toString())
          }
        },
        catch: (e) => console.error(`      ❌ Error: ${e}`)
      })
      yield* Console.log(`      ✓ Upserted to Vectorize`)
    }
  }), { concurrency })

  yield* Console.log("\n✅ Reindexing complete.")
})

// Build layers
const AILayer = Layer.mergeAll(
  TextExtractor.Live,
  PhotoAnalyzer.Live,
  DescriptionGenerator.Live,
  EmbeddingService.Live,
  ImageGenerator.Live,
  SearchDocumentBuilderLive
).pipe(
  Layer.provide(OpenRouterClient.Live)
)

const program = Effect.gen(function* () {
  if (!command || command === "help" || command === "--help") {
    yield* printUsage
    return
  }
  if (command === "list") {
    yield* listCommand
    return
  }
  if (command === "run") {
    const scraperId = parsed.commandArg
    if (!scraperId) { yield* Console.error("Missing scraper ID"); return }
    yield* runCommand(scraperId)
    return
  }
  if (command === "process") {
    const scraperId = parsed.commandArg
    if (!scraperId) { yield* Console.error("Missing scraper ID"); return }
    yield* processCommand(scraperId)
    return
  }
  if (command === "photos") {
    const sub = parsed.subCommand
    if (sub === "status") { yield* photosStatusCommand; return }
    if (sub === "reset") { yield* photosResetCommand; return }
    if (sub === "generate") { yield* photosGenerateCommand; return }
    yield* printUsage; return
 }
  if (command === "reindex") {
    yield* reindexCommand
    return
  }
  yield* Console.error(`Unknown command: ${command}`)
  yield* printUsage
})

const main = async () => {
  const fullLayer = Layer.merge(FetchHttpClient.layer, AILayer)
  const exit = await Effect.runPromiseExit(Effect.provide(program, fullLayer))
  if (Exit.isFailure(exit)) {
    console.error(Cause.pretty(exit.cause))
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err)
  process.exit(1)
})
