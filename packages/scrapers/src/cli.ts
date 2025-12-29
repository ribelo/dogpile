#!/usr/bin/env bun
import { Effect, Console, Exit, Cause, Layer } from "effect"
import { FetchHttpClient } from "@effect/platform"
import { getAdapter, listAdapters } from "./registry.js"
import type { RawDogData } from "./adapter.js"
import { $ } from "bun"

// Import core services
import {
  OpenRouterClientLive,
  TextExtractorLive,
  TextExtractor,
  PhotoAnalyzerLive,
  PhotoAnalyzer,
  DescriptionGeneratorLive,
  DescriptionGenerator,
} from "@dogpile/core/services"

const args = process.argv.slice(2)
const command = args[0]

const printUsage = Effect.gen(function* () {
  yield* Console.log(`
Dogpile Scraper CLI

Usage:
  bun run cli <command> [options]

Commands:
  list                    List all available scrapers
  run <scraper-id>        Run scraper (dry-run by default)
  process <scraper-id>    Full pipeline: scrape + AI + save

Options:
  --limit <n>             Limit dogs to process
  --json                  Output raw JSON
  --save                  Save to DB (for run command)

Examples:
  bun run cli list
  bun run cli run tozjawor
  bun run cli process tozjawor --limit 2
`)
})

const listCommand = Effect.gen(function* () {
  const adapters = listAdapters()
  yield* Console.log("\nAvailable scrapers:\n")
  for (const adapter of adapters) {
    yield* Console.log(`  ${adapter.id.padEnd(20)} ${adapter.name}`)
  }
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

const runCommand = (scraperId: string) =>
  Effect.gen(function* () {
    const limit = args.includes("--limit") ? parseInt(args[args.indexOf("--limit") + 1] ?? "5") : 5
    const jsonOutput = args.includes("--json")
    const saveToDb = args.includes("--save")

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
      for (let i = 0; i < Math.min(limit, rawDogs.length); i++) {
        yield* Console.log(formatDog(rawDogs[i], i))
      }
    }

    if (saveToDb) {
      yield* Console.log(`💾 Saving...`)
      const shelterSql = `INSERT INTO shelters (id, slug, name, url, city, status) VALUES ('${scraperId}', '${scraperId}', '${adapter.name}', 'https://tozjawor.pl', 'Jawor', 'active') ON CONFLICT(id) DO UPDATE SET name = excluded.name`
      yield* execSql(shelterSql)
      
      const now = Math.floor(Date.now() / 1000)
      for (const dog of rawDogs) {
        const sql = `INSERT INTO dogs (id, shelter_id, external_id, name, sex, raw_description, photos, fingerprint, status, urgent, created_at, updated_at, source_url, breed_estimates, personality_tags) VALUES ('${crypto.randomUUID()}', '${scraperId}', '${dog.externalId}', '${dog.name.replace(/'/g, "''")}', '${dog.sex ?? "unknown"}', '${(dog.rawDescription ?? "").replace(/'/g, "''")}', '${JSON.stringify(dog.photos ?? []).replace(/'/g, "''")}', '${dog.fingerprint}', 'available', ${dog.urgent ? 1 : 0}, ${now}, ${now}, 'https://tozjawor.pl/pets', '[]', '[]') ON CONFLICT(fingerprint) DO UPDATE SET updated_at = ${now}`
        yield* execSql(sql)
      }
      yield* Console.log(`   ✓ Saved ${rawDogs.length} dogs`)
    }
    yield* Console.log(`\n✅ Done.`)
  })

const processCommand = (scraperId: string) =>
  Effect.gen(function* () {
    const limitArg = args.includes("--limit") ? parseInt(args[args.indexOf("--limit") + 1] ?? "999") : 999

    const adapter = getAdapter(scraperId)
    if (!adapter) {
      yield* Console.error(`Unknown scraper: ${scraperId}`)
      return
    }

    yield* Console.log(`\n🐕 Processing: ${adapter.name}`)
    yield* Console.log(`   Pipeline: scrape → AI text → AI photo → generate bio → save\n`)

    const config = { shelterId: scraperId, baseUrl: "" }

    // Step 1: Scrape
    yield* Console.log("📡 Fetching...")
    const html = yield* adapter.fetch(config)
    const rawDogs = yield* adapter.parse(html, config)
    const dogsToProcess = rawDogs.slice(0, limitArg)
    yield* Console.log(`   Found ${rawDogs.length}, processing ${dogsToProcess.length}\n`)

    // Step 2: Ensure shelter
    const shelterSql = `INSERT INTO shelters (id, slug, name, url, city, status) VALUES ('${scraperId}', '${scraperId}', '${adapter.name}', 'https://tozjawor.pl', 'Jawor', 'active') ON CONFLICT(id) DO UPDATE SET name = excluded.name`
    yield* execSql(shelterSql)

    // Get services
    const textExtractor = yield* TextExtractor
    const photoAnalyzer = yield* PhotoAnalyzer
    const descGenerator = yield* DescriptionGenerator

    yield* Console.log("🤖 AI Processing...")
    const now = Math.floor(Date.now() / 1000)

    for (let i = 0; i < dogsToProcess.length; i++) {
      const dog = dogsToProcess[i]
      yield* Console.log(`\n[${i + 1}/${dogsToProcess.length}] ${dog.name}`)

      // Text extraction
      yield* Console.log(`   📝 Text extraction...`)
      const textResult = yield* textExtractor.extract(dog.rawDescription ?? "").pipe(
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

      // Save to DB
      const id = crypto.randomUUID()
      const esc = (s: string | null | undefined) => (s ?? "").replace(/'/g, "''")
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
          ear_type, tail_type, generated_bio
        ) VALUES (
          '${id}', '${scraperId}', '${dog.externalId}', '${esc(dog.name)}',
          '${textResult?.sex ?? dog.sex ?? "unknown"}',
          '${esc(dog.rawDescription)}',
          '${esc(JSON.stringify(dog.photos ?? []))}',
          '${dog.fingerprint}', 'available',
          ${textResult?.urgent ? 1 : 0}, ${now}, ${now}, 'https://tozjawor.pl/pets',
          '${esc(breedEstimates)}', '${esc(personalityTags)}',
          '${esc(sizeEstimate)}', '${esc(ageEstimate)}', '${esc(weightEstimate)}',
          ${textResult?.locationHints?.cityMention ? `'${esc(textResult.locationHints.cityMention)}'` : 'NULL'},
          ${textResult?.locationHints?.isFoster !== null && textResult?.locationHints?.isFoster !== undefined ? (textResult.locationHints.isFoster ? 1 : 0) : 'NULL'},
          ${textResult?.vaccinated !== null && textResult?.vaccinated !== undefined ? (textResult.vaccinated ? 1 : 0) : 'NULL'},
          ${textResult?.sterilized !== null && textResult?.sterilized !== undefined ? (textResult.sterilized ? 1 : 0) : 'NULL'},
          ${textResult?.chipped !== null && textResult?.chipped !== undefined ? (textResult.chipped ? 1 : 0) : 'NULL'},
          ${textResult?.goodWithKids !== null && textResult?.goodWithKids !== undefined ? (textResult.goodWithKids ? 1 : 0) : 'NULL'},
          ${textResult?.goodWithDogs !== null && textResult?.goodWithDogs !== undefined ? (textResult.goodWithDogs ? 1 : 0) : 'NULL'},
          ${textResult?.goodWithCats !== null && textResult?.goodWithCats !== undefined ? (textResult.goodWithCats ? 1 : 0) : 'NULL'},
          ${photoResult?.furLength ? `'${photoResult.furLength}'` : 'NULL'},
          ${photoResult?.furType ? `'${photoResult.furType}'` : 'NULL'},
          ${photoResult?.colorPrimary ? `'${esc(photoResult.colorPrimary)}'` : 'NULL'},
          ${photoResult?.colorSecondary ? `'${esc(photoResult.colorSecondary)}'` : 'NULL'},
          ${photoResult?.colorPattern ? `'${photoResult.colorPattern}'` : 'NULL'},
          ${photoResult?.earType ? `'${photoResult.earType}'` : 'NULL'},
          ${photoResult?.tailType ? `'${photoResult.tailType}'` : 'NULL'},
          '${esc(bio?.bio ?? "")}'
        ) ON CONFLICT(fingerprint) DO UPDATE SET
          updated_at = ${now}, last_seen_at = ${now},
          breed_estimates = excluded.breed_estimates,
          personality_tags = excluded.personality_tags,
          generated_bio = excluded.generated_bio
      `
      yield* execSql(sql)
      yield* Console.log(`   💾 Saved`)
    }

    yield* Console.log(`\n\n✅ Complete! Processed ${dogsToProcess.length} dogs.`)
  })

// Build layers
const AILayer = Layer.mergeAll(
  TextExtractorLive,
  PhotoAnalyzerLive,
  DescriptionGeneratorLive
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
    const scraperId = args[1]
    if (!scraperId) { yield* Console.error("Missing scraper ID"); return }
    yield* runCommand(scraperId)
    return
  }
  if (command === "process") {
    const scraperId = args[1]
    if (!scraperId) { yield* Console.error("Missing scraper ID"); return }
    yield* processCommand(scraperId)
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
