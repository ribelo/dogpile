#!/usr/bin/env bun
import { Effect, Console, Exit, Cause } from "effect"
import { FetchHttpClient } from "@effect/platform"
import { getAdapter, listAdapters } from "./registry.js"
import type { RawDogData } from "./adapter.js"
import { $ } from "bun"

const args = process.argv.slice(2)
const command = args[0]

const printUsage = Effect.gen(function* () {
  yield* Console.log(`
Dogpile Scraper CLI

Usage:
  bun run cli <command> [options]

Commands:
  list                    List all available scrapers
  run <scraper-id>        Run a scraper (dry-run by default)
  
Options:
  --limit <n>             Limit number of dogs to show (default: 5)
  --json                  Output raw JSON
  --save                  Save to remote D1 database

Examples:
  bun run cli list
  bun run cli run tozjawor
  bun run cli run tozjawor --save
  bun run cli run tozjawor --limit 10 --json
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
  const lines = [
    `─── Dog ${index + 1} ───`,
    `  Name:        ${dog.name}`,
    `  Fingerprint: ${dog.fingerprint}`,
    `  External ID: ${dog.externalId}`,
    `  Sex:         ${dog.sex ?? "unknown"}`,
    `  Age:         ${dog.ageMonths ? `${dog.ageMonths} months` : "unknown"}`,
    `  Photos:      ${dog.photos?.length ?? 0}`,
  ]
  if (dog.photos && dog.photos.length > 0) {
    lines.push(`               ${dog.photos[0]}`)
  }
  const desc = (dog.rawDescription ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
  lines.push(`  Description: ${desc}...`)
  return lines.join("\n")
}

const execSql = (sql: string) =>
  Effect.tryPromise({
    try: () => $`bunx wrangler d1 execute dogpile-db-preview --remote --command ${sql}`.quiet().nothrow(),
    catch: (e) => new Error(`SQL failed: ${e}`)
  })

const runCommand = (scraperId: string) =>
  Effect.gen(function* () {
    const limit = args.includes("--limit")
      ? parseInt(args[args.indexOf("--limit") + 1] ?? "5")
      : 5
    const jsonOutput = args.includes("--json")
    const saveToDb = args.includes("--save")

    const adapter = getAdapter(scraperId)
    if (!adapter) {
      yield* Console.error(`Unknown scraper: ${scraperId}`)
      yield* Console.log("\nAvailable scrapers:")
      const adapters = listAdapters()
      for (const a of adapters) {
        yield* Console.log(`  - ${a.id}`)
      }
      return
    }

    yield* Console.log(`\n🐕 Running scraper: ${adapter.name} (${adapter.id})`)
    if (saveToDb) {
      yield* Console.log(`   Mode: SAVE TO DB\n`)
    } else {
      yield* Console.log(`   Mode: DRY RUN (use --save to persist)\n`)
    }

    const config = {
      shelterId: scraperId,
      baseUrl: "",
    }

    yield* Console.log("📡 Fetching data...")
    const html = yield* adapter.fetch(config)
    yield* Console.log(`   Received ${html.length} bytes`)

    yield* Console.log("🔍 Parsing...")
    const rawDogs = yield* adapter.parse(html, config)
    yield* Console.log(`   Found ${rawDogs.length} dogs\n`)

    if (jsonOutput) {
      const toShow = rawDogs.slice(0, limit)
      yield* Console.log(JSON.stringify(toShow, null, 2))
    } else if (!saveToDb) {
      const toShow = rawDogs.slice(0, limit)
      for (let i = 0; i < toShow.length; i++) {
        yield* Console.log(formatDog(toShow[i], i))
        yield* Console.log("")
      }

      if (rawDogs.length > limit) {
        yield* Console.log(`... and ${rawDogs.length - limit} more dogs`)
      }
    }

    if (saveToDb) {
      yield* Console.log(`💾 Saving to database...`)
      
      // Create shelter
      const shelterId = scraperId
      const shelterSql = `INSERT INTO shelters (id, slug, name, url, city, status) VALUES ('${shelterId}', '${scraperId}', '${adapter.name}', 'https://tozjawor.pl', 'Jawor', 'active') ON CONFLICT(id) DO UPDATE SET name = excluded.name`
      
      yield* execSql(shelterSql)
      yield* Console.log(`   ✓ Shelter "${adapter.name}" ready`)
      
      // Insert dogs
      let processed = 0
      const now = Math.floor(Date.now() / 1000)
      
      for (const dog of rawDogs) {
        const id = crypto.randomUUID()
        const photos = JSON.stringify(dog.photos ?? []).replace(/'/g, "''")
        const rawDesc = (dog.rawDescription ?? "").replace(/'/g, "''")
        const name = dog.name.replace(/'/g, "''")
        
        const sql = `INSERT INTO dogs (id, shelter_id, external_id, name, sex, raw_description, photos, fingerprint, status, urgent, created_at, updated_at, source_url, breed_estimates, personality_tags) VALUES ('${id}', '${shelterId}', '${dog.externalId}', '${name}', '${dog.sex ?? "unknown"}', '${rawDesc}', '${photos}', '${dog.fingerprint}', 'available', ${dog.urgent ? 1 : 0}, ${now}, ${now}, 'https://tozjawor.pl/pets', '[]', '[]') ON CONFLICT(fingerprint) DO UPDATE SET updated_at = ${now}, last_seen_at = ${now}`
        
        yield* execSql(sql)
        processed++
        process.stdout.write(`\r   Saving... ${processed}/${rawDogs.length}`)
      }
      
      yield* Console.log(`\n   ✓ Processed ${processed} dogs`)
    }

    yield* Console.log(`\n✅ Complete.`)
  })

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
    if (!scraperId) {
      yield* Console.error("Error: Missing scraper ID")
      yield* printUsage
      return
    }
    yield* runCommand(scraperId)
    return
  }

  yield* Console.error(`Unknown command: ${command}`)
  yield* printUsage
})

const main = async () => {
  const exit = await Effect.runPromiseExit(Effect.provide(program, FetchHttpClient.layer))
  if (Exit.isFailure(exit)) {
    console.error(Cause.pretty(exit.cause))
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err)
  process.exit(1)
})
