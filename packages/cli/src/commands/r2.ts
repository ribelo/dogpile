import { Command } from "@effect/cli"
import { Console, Effect } from "effect"
import { execSync } from "node:child_process"
import { mkdirSync, readdirSync, existsSync, writeFileSync, readFileSync } from "node:fs"
import { Database } from "bun:sqlite"
import { globSync } from "glob"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { UnrecoverableError } from "../errors"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, "../../../..")
const CONFIG_PATH = path.join(REPO_ROOT, "apps/api/wrangler.toml")

const findLocalDb = () => Effect.gen(function* () {
  const pattern = path.join(REPO_ROOT, "apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite")
  const paths = globSync(pattern)
  const dbPaths = paths.filter(p => !p.endsWith("-shm") && !p.endsWith("-wal"))
  if (dbPaths.length === 0) {
    return yield* new UnrecoverableError({ reason: "Local SQLite DB not found" })
  }
  return dbPaths[0]
})

const getR2KeysFromDb = () => Effect.gen(function* () {
  const dbPath = yield* findLocalDb()
  const db = new Database(dbPath, { readonly: true })
  const rows = db.query("SELECT photos_generated FROM dogs WHERE photos_generated != '[]'").all() as { photos_generated: string }[]
  db.close()
  
  const keys: string[] = []
  for (const row of rows) {
    const photos = JSON.parse(row.photos_generated) as string[]
    for (const photo of photos) {
      // photo is like "generated/tozjawor:xxx-professional"
      const base = photo.replace("generated/", "")
      keys.push(`${base}-sm.webp`)
      keys.push(`${base}-lg.webp`)
    }
  }
  return keys
})

const pullCommand = Command.make("pull", {}, () =>
  Effect.gen(function* () {
    yield* Console.log("Pulling R2 generated photos from remote...")

    // Get keys from remote D1 first
    yield* Console.log("Fetching photo keys from remote D1...")
    const cmd = `wrangler d1 execute dogpile-db --remote --json --config ${CONFIG_PATH} --command "SELECT photos_generated FROM dogs WHERE photos_generated != '[]'"`
    const output = execSync(cmd, { encoding: "utf8", cwd: REPO_ROOT })
    const jsonMatch = output.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      yield* Console.log("No photos found in remote DB")
      return
    }
    const result = JSON.parse(jsonMatch[0])
    const rows = result[0]?.results ?? []

    const keys: string[] = []
    for (const row of rows) {
      const photos = JSON.parse(row.photos_generated) as string[]
      for (const photo of photos) {
        const base = photo.replace("generated/", "")
        keys.push(`${base}-sm.webp`)
        keys.push(`${base}-lg.webp`)
      }
    }

    yield* Console.log(`Found ${keys.length} photo keys`)

    const cacheDir = path.join(REPO_ROOT, ".r2-cache/dogpile-generated")
    mkdirSync(cacheDir, { recursive: true })

    let synced = 0
    for (const key of keys) {
      const safeFilename = key.replace(/[/:]/g, "_")
      const localPath = path.join(cacheDir, safeFilename)
      try {
        // Download from remote
        execSync(
          `wrangler r2 object get "dogpile-generated/${key}" --remote --file "${localPath}" --config ${CONFIG_PATH}`,
          { cwd: REPO_ROOT, stdio: "pipe" }
        )
        // Upload to local
        execSync(
          `wrangler r2 object put "dogpile-generated/${key}" --file "${localPath}" --config ${CONFIG_PATH}`,
          { cwd: REPO_ROOT, stdio: "pipe" }
        )
        synced++
        if (synced % 10 === 0) yield* Console.log(`  Synced ${synced}/${keys.length}`)
      } catch {
        // Skip failures
      }
    }
    yield* Console.log(`\nPull complete. Synced ${synced} objects.`)
  })
)

const pushCommand = Command.make("push", {}, () =>
  Effect.gen(function* () {
    yield* Console.log("Pushing R2 generated photos to remote...")

    // Get keys from local DB
    const keys = yield* getR2KeysFromDb()
    yield* Console.log(`Found ${keys.length} photo keys in local DB`)

    if (keys.length === 0) {
      yield* Console.log("No photos to push")
      return
    }

    const cacheDir = path.join(REPO_ROOT, ".r2-cache/dogpile-generated")
    mkdirSync(cacheDir, { recursive: true })

    // First export from local R2 to cache
    yield* Console.log("Exporting from local R2 to cache...")
    let exported = 0
    for (const key of keys) {
      const safeFilename = key.replace(/[/:]/g, "_")
      const localPath = path.join(cacheDir, safeFilename)
      try {
        execSync(
          `wrangler r2 object get "dogpile-generated/${key}" --file "${localPath}" --config ${CONFIG_PATH}`,
          { cwd: REPO_ROOT, stdio: "pipe" }
        )
        exported++
      } catch {
        // Object doesn't exist locally
      }
    }
    yield* Console.log(`  Exported ${exported} objects to cache`)

    // Then push cache to remote
    yield* Console.log("Pushing to remote R2...")
    let pushed = 0
    for (const key of keys) {
      const safeFilename = key.replace(/[/:]/g, "_")
      const localPath = path.join(cacheDir, safeFilename)
      if (!existsSync(localPath)) continue
      try {
        execSync(
          `wrangler r2 object put "dogpile-generated/${key}" --remote --file "${localPath}" --config ${CONFIG_PATH}`,
          { cwd: REPO_ROOT, stdio: "pipe" }
        )
        pushed++
        if (pushed % 10 === 0) yield* Console.log(`  Pushed ${pushed}`)
      } catch {
        // Skip failures
      }
    }
    yield* Console.log(`\nPush complete. Pushed ${pushed} objects.`)
  })
)

export const r2Command = Command.make("r2", {}).pipe(
  Command.withSubcommands([pullCommand, pushCommand])
)
