import { Command } from "@effect/cli"
import { Console, Effect } from "effect"
import { execSync } from "node:child_process"
import { writeFileSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { Database } from "bun:sqlite"
import { globSync } from "glob"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { $ } from "bun"
import { UnrecoverableError } from "../errors"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, "../../../..")
const CONFIG_PATH = path.join(REPO_ROOT, "apps/api/wrangler.toml")
const DB_NAME = "dogpile-db"

const findLocalDb = () => Effect.gen(function* () {
  const pattern = path.join(REPO_ROOT, "apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite")
  const paths = globSync(pattern)
  const dbPaths = paths.filter(p => !p.endsWith("-shm") && !p.endsWith("-wal"))
  if (dbPaths.length === 0) {
    return yield* new UnrecoverableError({ reason: "Local SQLite DB not found. Run 'wrangler d1 migrations apply dogpile-db --local' in apps/api first." })
  }
  return dbPaths[0]
})

const escapeSQL = (val: unknown): string => {
  if (val === null || val === undefined) return "NULL"
  if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'`
  if (typeof val === "string") return `'${val.replace(/'/g, "''")}'`
  if (typeof val === "boolean") return val ? "1" : "0"
  return String(val)
}

const pullCommand = Command.make("pull", {}, () =>
  Effect.gen(function* () {
    yield* Console.log("Pulling data from remote D1...")

    const exportShelters = path.join(tmpdir(), `dogpile-remote-export-shelters-${Date.now()}.sql`)
    const exportDogs = path.join(tmpdir(), `dogpile-remote-export-dogs-${Date.now()}.sql`)
    try {
      yield* Console.log("Exporting shelters + dogs from remote D1...")
      execSync(
        `wrangler d1 export ${DB_NAME} --remote --config ${CONFIG_PATH} --output ${exportShelters} --table shelters --no-schema`,
        { stdio: "inherit", cwd: REPO_ROOT }
      )
      execSync(
        `wrangler d1 export ${DB_NAME} --remote --config ${CONFIG_PATH} --output ${exportDogs} --table dogs --no-schema`,
        { stdio: "inherit", cwd: REPO_ROOT }
      )

      yield* Console.log("Clearing local D1 tables...")
      execSync(
        `wrangler d1 execute ${DB_NAME} --local --config ${CONFIG_PATH} --command "DELETE FROM dogs; DELETE FROM shelters;"`,
        { stdio: "inherit", cwd: REPO_ROOT }
      )

      yield* Console.log("Importing into local D1...")
      execSync(
        `wrangler d1 execute ${DB_NAME} --local --config ${CONFIG_PATH} --file ${exportShelters}`,
        { stdio: "inherit", cwd: REPO_ROOT }
      )
      execSync(
        `wrangler d1 execute ${DB_NAME} --local --config ${CONFIG_PATH} --file ${exportDogs}`,
        { stdio: "inherit", cwd: REPO_ROOT }
      )

      const dbPath = yield* findLocalDb()
      yield* Console.log(`Pull complete. Local DB updated at ${dbPath}`)
    } finally {
      try {
        unlinkSync(exportShelters)
      } catch {}
      try {
        unlinkSync(exportDogs)
      } catch {}
    }
  })
)

const pushCommand = Command.make("push", {}, () =>
  Effect.gen(function* () {
    yield* Console.log("Pushing data to remote D1...")

    const dbPath = yield* findLocalDb()
    const db = new Database(dbPath)

    let sql = "PRAGMA foreign_keys = OFF;\n"

    const shelters = db.query("SELECT * FROM shelters").all() as Record<string, unknown>[]
    for (const s of shelters) {
      const cols = Object.keys(s)
      const vals = cols.map(c => escapeSQL(s[c]))
      const updates = cols.filter(c => c !== "id").map(c => `${c} = excluded.${c}`).join(", ")
      sql += `INSERT INTO shelters (${cols.join(", ")}) VALUES (${vals.join(", ")}) ON CONFLICT(id) DO UPDATE SET ${updates};\n`
    }

    const dogs = db.query("SELECT * FROM dogs").all() as Record<string, unknown>[]
    for (const d of dogs) {
      const cols = Object.keys(d)
      const vals = cols.map(c => escapeSQL(d[c]))
      const updates = cols.filter(c => c !== "fingerprint" && c !== "id").map(c => `${c} = excluded.${c}`).join(", ")
      sql += `INSERT INTO dogs (${cols.join(", ")}) VALUES (${vals.join(", ")}) ON CONFLICT(fingerprint) DO UPDATE SET ${updates};\n`
    }

    db.close()

    const tmpFile = path.join(tmpdir(), `dogpile-sync-${Date.now()}.sql`)
    writeFileSync(tmpFile, sql)

    try {
      yield* Console.log(`Executing SQL on remote D1 (${shelters.length} shelters, ${dogs.length} dogs)...`)
      execSync(`wrangler d1 execute ${DB_NAME} --remote --config ${CONFIG_PATH} --file ${tmpFile}`, { 
        stdio: "inherit",
        cwd: REPO_ROOT
      })
      yield* Console.log("Push complete.")
    } finally {
      unlinkSync(tmpFile)
    }
  })
)

const validateCommand = Command.make("validate", {}, () =>
  Effect.gen(function* () {
    yield* Console.log("Validating DB ↔ R2 photo consistency...")
    
    const dbPath = yield* findLocalDb()
    const db = new Database(dbPath)
    
    const dogs = db.query("SELECT fingerprint, photos_generated FROM dogs WHERE photos_generated != '[]' AND photos_generated IS NOT NULL").all() as { fingerprint: string; photos_generated: string }[]
    db.close()
    
    yield* Console.log(`Found ${dogs.length} dogs with generated photos in DB`)
    
    let missingCount = 0
    for (const dog of dogs) {
      const photos = JSON.parse(dog.photos_generated) as string[]
      for (const photo of photos) {
        const baseKey = photo.replace(/^generated\//, "")
        const r2Key = `dogpile-generated/${baseKey}-lg.webp`
        
        const exists = yield* Effect.tryPromise({
          try: async () => {
            const result = await $`wrangler r2 object get ${r2Key} --config ${CONFIG_PATH} --pipe`.quiet().nothrow()
            return result.exitCode === 0
          },
          catch: () => false
        }).pipe(Effect.catchAll(() => Effect.succeed(false)))
        
        if (!exists) {
          yield* Console.log(`❌ Missing: ${r2Key} (dog: ${dog.fingerprint})`)
          missingCount++
        }
      }
    }
    
    if (missingCount === 0) {
      yield* Console.log("✅ All photos in DB exist in R2")
    } else {
      yield* Console.log(`\n⚠️ Found ${missingCount} missing photos`)
    }
  })
)

export const dbCommand = Command.make("db", {}).pipe(
  Command.withSubcommands([pullCommand, pushCommand, validateCommand])
)
