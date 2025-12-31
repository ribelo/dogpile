#!/usr/bin/env bun
import { Effect, Console, Exit, Cause, Layer } from "effect"
import { FetchHttpClient } from "@effect/platform"
import { getAdapter, listAdapters } from "./registry.js"
import type { RawDogData } from "./adapter.js"
import { $ } from "bun"
import { writeFileSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"


// R2 public domain for generated photos
const R2_GENERATED_DOMAIN = "https://dogpile-generated.extropy.club"

const toPublicUrl = (key: string): string =>
  `${R2_GENERATED_DOMAIN}/${encodeURIComponent(key)}`

// Import core services
import {
  OpenRouterClientLive,
  TextExtractorLive,
  TextExtractor,
  PhotoAnalyzerLive,
  PhotoAnalyzer,
  DescriptionGeneratorLive,
  DescriptionGenerator,
  EmbeddingService,
  EmbeddingServiceLive,
  ImageGenerator,
  ImageGeneratorLive,
} from "@dogpile/core/services"

interface ParsedArgs {
  command: string | null
  commandArg: string | null
  flags: Map<string, string | boolean>
}

const parseArgs = (argv: string[]): ParsedArgs => {
  const flags = new Map<string, string | boolean>()
  let command: string | null = null
  let commandArg: string | null = null

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
      commandArg = arg
    }
  }

  return { command, commandArg, flags }
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
  bun run cli <command> [options]

Commands:
  list                    List all available scrapers
  run <scraper-id>        Run scraper (dry-run by default)
  process <scraper-id>    Full pipeline: scrape + AI + save
  regenerate-photos         Generate AI photos for dogs in DB without them

Options:
  --limit <n>             Limit dogs to process
  --json                  Output raw JSON
  --save                  Save to DB (for run command)
  --concurrency <n>       Parallel AI processing (1-60, default 10)
  --generate-photos         Generate AI fisheye nose photos (expensive)

Examples:
  bun run cli list
  bun run cli run tozjawor
  bun run cli process tozjawor --limit 2
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
    try: () => $`bunx wrangler d1 execute dogpile-db-preview --remote --command ${sql}`.quiet().nothrow(),
    catch: (e) => new Error(`SQL failed: ${e}`)
  })

const uploadToR2 = (base64Data: string, key: string) =>
  Effect.tryPromise({
    try: async () => {
      // Decode base64 to temp file
      const data = base64Data.replace(/^data:image\/\w+;base64,/, "")
      const buffer = Buffer.from(data, "base64")
      const tmpPath = join(tmpdir(), `dogpile-${Date.now()}.png`)
      writeFileSync(tmpPath, buffer)

      // Upload via wrangler r2
      await $`bunx wrangler r2 object put dogpile-generated/${key} --remote --file ${tmpPath}`.quiet()

      // Cleanup temp file
      unlinkSync(tmpPath)

      return key
    },
    catch: (e) => new Error(`R2 upload failed: ${e}`)
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
      const shelterSql = `INSERT INTO shelters (id, slug, name, url, city, status) VALUES ('${esc(scraperId)}', '${esc(scraperId)}', '${esc(adapter.name)}', '${esc(adapter.url)}', '${esc(adapter.city)}', 'active') ON CONFLICT(id) DO UPDATE SET name = excluded.name`
      yield* execSql(shelterSql)

      const now = Math.floor(Date.now() / 1000)
      yield* Effect.forEach(rawDogs, (dog) =>
        Effect.gen(function* () {
          const sql = `INSERT INTO dogs (id, shelter_id, external_id, name, sex, raw_description, photos, fingerprint, status, urgent, created_at, updated_at, source_url, breed_estimates, personality_tags) VALUES ('${crypto.randomUUID()}', '${esc(scraperId)}', '${esc(dog.externalId)}', '${esc(dog.name)}', '${esc(dog.sex ?? "unknown")}', '${esc(dog.rawDescription)}', '${esc(JSON.stringify(dog.photos ?? []))}', '${esc(dog.fingerprint)}', 'available', ${dog.urgent ? 1 : 0}, ${now}, ${now}, '${esc(adapter.sourceUrl)}', '[]', '[]') ON CONFLICT(fingerprint) DO UPDATE SET updated_at = ${now}`
          yield* execSql(sql)
        })
      )
      yield* Console.log(`   ✓ Saved ${rawDogs.length} dogs`)
    }
    yield* Console.log(`\n✅ Done.`)
  })

const processCommand = (scraperId: string) =>
  Effect.gen(function* () {
    const limitArg = getIntFlag(parsed.flags, "limit", 999)
    const concurrency = Math.min(60, Math.max(1, getIntFlag(parsed.flags, "concurrency", 10)))

    const adapter = getAdapter(scraperId)
    if (!adapter) {
      yield* Console.error(`Unknown scraper: ${scraperId}`)
      return
    }

    yield* Console.log(`\n🐕 Processing: ${adapter.name}`)
    yield* Console.log(`   Pipeline: scrape → AI text → AI photo → generate bio → save\n`)
    yield* Console.log(`   Concurrency: ${concurrency}`)

    const config = { shelterId: scraperId, baseUrl: "" }

    // Step 1: Scrape
    yield* Console.log("📡 Fetching...")
    const html = yield* adapter.fetch(config)
    const rawDogs = yield* adapter.parse(html, config)
    const dogsToProcess = rawDogs.slice(0, limitArg)
    yield* Console.log(`   Found ${rawDogs.length}, processing ${dogsToProcess.length}\n`)

    const esc = (s: string | null | undefined) => (s ?? "").replace(/'/g, "''")
    // Step 2: Ensure shelter
    const shelterSql = `INSERT INTO shelters (id, slug, name, url, city, status) VALUES ('${esc(scraperId)}', '${esc(scraperId)}', '${esc(adapter.name)}', '${esc(adapter.url)}', '${esc(adapter.city)}', 'active') ON CONFLICT(id) DO UPDATE SET name = excluded.name`
    yield* execSql(shelterSql)

    // Get services
    const textExtractor = yield* TextExtractor
    const photoAnalyzer = yield* PhotoAnalyzer
    const descGenerator = yield* DescriptionGenerator
    const embeddingService = yield* EmbeddingService
    const imageGenerator = yield* ImageGenerator

    yield* Console.log("🤖 AI Processing...")
    const now = Math.floor(Date.now() / 1000)

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
        if (bio?.bio && getBoolFlag(parsed.flags, "generate-photos")) {
          yield* Console.log(`   🎨 Generating AI photos...`)
          const imgResult = yield* imageGenerator.generatePhotos({ dogDescription: bio.bio, referencePhotoUrl: dog.photos?.[0] }).pipe(
            Effect.catchAll((e) => {
              console.log(`   ⚠️ Image gen failed: ${e.message}`)
              return Effect.succeed(null)
            })
          )
          if (imgResult?.professional) {
            const r2Key = `${dog.fingerprint}-professional.png`
            yield* Console.log(`   ☁️ Uploading professional photo to R2...`)
            const uploadedKey = yield* uploadToR2(imgResult.professional.base64Url, r2Key).pipe(
              Effect.catchAll((e) => {
                console.log(`   ⚠️ R2 upload failed: ${e.message}`)
                return Effect.succeed(null)
              })
            )
            if (uploadedKey) {
              generatedPhotoUrls.push(toPublicUrl(uploadedKey))
              yield* Console.log(`      ✓ Uploaded: ${uploadedKey}`)
            }
          }
          if (imgResult?.funNose) {
            const r2Key = `${dog.fingerprint}-nose.png`
            yield* Console.log(`   ☁️ Uploading fun nose photo to R2...`)
            const uploadedKey = yield* uploadToR2(imgResult.funNose.base64Url, r2Key).pipe(
              Effect.catchAll((e) => {
                console.log(`   ⚠️ R2 upload failed: ${e.message}`)
                return Effect.succeed(null)
              })
            )
            if (uploadedKey) {
              generatedPhotoUrls.push(toPublicUrl(uploadedKey))
              yield* Console.log(`      ✓ Uploaded: ${uploadedKey}`)
            }
          }
        }


        // Save to DB
        const id = crypto.randomUUID()
        const breedEstimates = JSON.stringify([...(textResult?.breedEstimates ?? []), ...(photoResult?.breedEstimates ?? [])].slice(0, 5))
        const personalityTags = JSON.stringify(textResult?.personalityTags ?? [])
        const sizeEstimate = JSON.stringify(textResult?.sizeEstimate ?? photoResult?.sizeEstimate ?? null)
        const ageEstimate = JSON.stringify(textResult?.ageEstimate ?? null)
        const weightEstimate = JSON.stringify(textResult?.weightEstimate ?? null)

        const sql = `
          INSERT INTO dogs (
            id, shelter_id, external_id, name, sex, raw_description, photos, fingerprint,
            status, urgent, created_at, updated_at, source_url,
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
            ${textResult?.urgent ? 1 : 0}, ${now}, ${now}, '${esc(adapter.sourceUrl)}',
            '${esc(breedEstimates)}', '${esc(personalityTags)}',
            '${esc(sizeEstimate)}', '${esc(ageEstimate)}', '${esc(weightEstimate)}',
            ${textResult?.locationHints?.cityMention ? `'${esc(textResult.locationHints.cityMention)}'` : `'${esc(adapter.city)}'`},
            ${textResult?.locationHints?.isFoster ? 1 : 0},
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
            raw_description = excluded.raw_description,
            photos = excluded.photos,
            urgent = excluded.urgent,
            breed_estimates = CASE WHEN excluded.breed_estimates != '[]' THEN excluded.breed_estimates ELSE dogs.breed_estimates END,
            personality_tags = CASE WHEN excluded.personality_tags != '[]' THEN excluded.personality_tags ELSE dogs.personality_tags END,
            generated_bio = CASE WHEN excluded.generated_bio != '' THEN excluded.generated_bio ELSE dogs.generated_bio END,
            photos_generated = CASE WHEN excluded.photos_generated != '[]' THEN excluded.photos_generated ELSE dogs.photos_generated END
        `
        yield* execSql(sql).pipe(
          Effect.catchAll((e) => {
            console.log(`   ⚠️ DB save failed: ${e}`)
            return Effect.succeed(null)
          })
        )
        yield* Console.log(`   💾 Saved`)
      })

    yield* Effect.forEach(
      dogsToProcess,
      (dog, i) => processDog(dog, i),
      { concurrency }
    )

    yield* Console.log(`\n\n✅ Complete! Processed ${dogsToProcess.length} dogs.`)
  })


// Regenerate photos for dogs in DB that don't have generated photos
const regeneratePhotosCommand = () =>
  Effect.gen(function* () {
    const concurrency = Math.min(60, Math.max(1, getIntFlag(parsed.flags, "concurrency", 5)))
    const limit = getIntFlag(parsed.flags, "limit", 999)
    
    yield* Console.log(`\n🎨 Regenerating photos for dogs without AI-generated photos`)
    yield* Console.log(`   Concurrency: ${concurrency}\n`)

    // Fetch dogs from DB that need photos
    yield* Console.log("📡 Fetching dogs from DB...")
    const result = yield* Effect.tryPromise({
      try: async () => {
        const proc = await $`bunx wrangler d1 execute dogpile-db-preview --remote --json --command "SELECT id, name, fingerprint, photos, generated_bio, photos_generated FROM dogs WHERE photos_generated = '[]' OR photos_generated IS NULL LIMIT ${limit}"`.quiet()
        return JSON.parse(proc.stdout.toString())
      },
      catch: (e) => new Error(`DB query failed: ${e}`)
    })

    const dogs = result[0]?.results ?? []
    yield* Console.log(`   Found ${dogs.length} dogs needing photos\n`)

    if (dogs.length === 0) {
      yield* Console.log("✅ All dogs already have generated photos!")
      return
    }

    const imageGen = yield* ImageGenerator

    const processDbDog = (dog: { id: string; name: string; fingerprint: string; photos: string; generated_bio: string | null }, i: number) =>
      Effect.gen(function* () {
        const photos = JSON.parse(dog.photos || "[]") as string[]
        const bio = dog.generated_bio || dog.name

        yield* Console.log(`[${i + 1}/${dogs.length}] ${dog.name}`)

        if (photos.length === 0) {
          yield* Console.log(`   ⚠️ No reference photos, skipping`)
          return
        }

        yield* Console.log(`   🎨 Generating AI photos...`)
        const imgResult = yield* imageGen.generatePhotos({
          dogDescription: bio,
          referencePhotoUrl: photos[0],
        }).pipe(
          Effect.catchAll((e) => {
            console.log(`   ⚠️ Image gen failed: ${e.message}`)
            return Effect.succeed(null)
          })
        )

        const generatedPhotoUrls: string[] = []
        if (imgResult?.professional) {
          const r2Key = `${dog.fingerprint}-professional.png`
          yield* Console.log(`   ☁️ Uploading professional photo to R2...`)
          const uploadedKey = yield* uploadToR2(imgResult.professional.base64Url, r2Key).pipe(
            Effect.catchAll((e) => {
              console.log(`   ⚠️ R2 upload failed: ${e.message}`)
              return Effect.succeed(null)
            })
          )
          if (uploadedKey) {
            generatedPhotoUrls.push(toPublicUrl(uploadedKey))
            yield* Console.log(`      ✓ Uploaded: ${uploadedKey}`)
          }
        }

        if (imgResult?.funNose) {
          const r2Key = `${dog.fingerprint}-nose.png`
          yield* Console.log(`   ☁️ Uploading fun nose photo to R2...`)
          const uploadedKey = yield* uploadToR2(imgResult.funNose.base64Url, r2Key).pipe(
            Effect.catchAll((e) => {
              console.log(`   ⚠️ R2 upload failed: ${e.message}`)
              return Effect.succeed(null)
            })
          )
          if (uploadedKey) {
            generatedPhotoUrls.push(toPublicUrl(uploadedKey))
            yield* Console.log(`      ✓ Uploaded: ${uploadedKey}`)
          }
        }

        if (generatedPhotoUrls.length > 0) {
          const photosGenerated = JSON.stringify(generatedPhotoUrls)
          const sql = `UPDATE dogs SET photos_generated = '${photosGenerated.replace(/'/g, "''")}' WHERE id = '${dog.id}'`
          yield* execSql(sql).pipe(
            Effect.catchAll((e) => {
              console.log(`   ⚠️ DB update failed: ${e}`)
              return Effect.succeed(null)
            })
          )
          yield* Console.log(`   💾 Saved ${generatedPhotoUrls.length} photos`)
        }
      })

    yield* Console.log("🤖 Generating photos...\n")
    yield* Effect.forEach(
      dogs,
      (dog, i) => processDbDog(dog as { id: string; name: string; fingerprint: string; photos: string; generated_bio: string | null }, i),
      { concurrency }
    )

    yield* Console.log(`\n✅ Complete!`)
  })

// Build layers
const AILayer = Layer.mergeAll(
  TextExtractorLive,
  PhotoAnalyzerLive,
  DescriptionGeneratorLive,
  EmbeddingServiceLive,
  ImageGeneratorLive
).pipe(Layer.provide(OpenRouterClientLive))

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
  if (command === "regenerate-photos") {
    yield* regeneratePhotosCommand()
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
