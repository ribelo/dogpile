import { Command } from "@effect/cli"
import { Console, Effect } from "effect"
import { execSync } from "node:child_process"
import { writeFileSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { Database } from "bun:sqlite"
import { globSync } from "glob"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, "../../../..")
const CONFIG_PATH = path.join(REPO_ROOT, "apps/api/wrangler.toml")
const DB_NAME = "dogpile-db"

const findLocalDb = (): string => {
  const pattern = path.join(REPO_ROOT, "apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite")
  const paths = globSync(pattern)
  const dbPaths = paths.filter(p => !p.endsWith("-shm") && !p.endsWith("-wal"))
  if (dbPaths.length === 0) {
    throw new Error("Local SQLite DB not found. Run 'wrangler d1 migrations apply dogpile-db --local' in apps/api first.")
  }
  return dbPaths[0]
}

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

    const tables = ["shelters", "dogs"]
    const data: Record<string, unknown[]> = {}

    for (const table of tables) {
      yield* Console.log(`Fetching ${table}...`)
      const cmd = `nix develop -c wrangler d1 execute ${DB_NAME} --remote --json --config ${CONFIG_PATH} --command "SELECT * FROM ${table}"`
      const output = execSync(cmd, { encoding: "utf8", cwd: REPO_ROOT })
      const jsonMatch = output.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        throw new Error(`Failed to parse wrangler output for ${table}: ${output.slice(0, 200)}`)
      }
      const result = JSON.parse(jsonMatch[0])
      data[table] = result[0].results
    }

    const dbPath = findLocalDb()
    yield* Console.log(`Updating local DB at ${dbPath}...`)
    const db = new Database(dbPath)

    db.run("BEGIN TRANSACTION")
    try {
      for (const table of tables) {
        db.run(`DELETE FROM ${table}`)
        const rows = data[table] as Record<string, unknown>[]
        if (rows.length === 0) continue

        const columns = Object.keys(rows[0])
        const placeholders = columns.map(() => "?").join(",")
        const insert = db.prepare(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${placeholders})`)

        for (const row of rows) {
          const values = columns.map(col => {
            const val = row[col]
            return (typeof val === "object" && val !== null) ? JSON.stringify(val) : val
          }) as (string | number | null | Uint8Array)[]
          insert.run(...values as [])
        }
      }
      db.run("COMMIT")
    } catch (e) {
      db.run("ROLLBACK")
      throw e
    }

    db.close()
    yield* Console.log(`Pull complete. Synced ${(data.shelters as unknown[]).length} shelters, ${(data.dogs as unknown[]).length} dogs.`)
  })
)

const pushCommand = Command.make("push", {}, () =>
  Effect.gen(function* () {
    yield* Console.log("Pushing data to remote D1...")

    const dbPath = findLocalDb()
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
      execSync(`nix develop -c wrangler d1 execute ${DB_NAME} --remote --config ${CONFIG_PATH} --file ${tmpFile}`, { 
        stdio: "inherit",
        cwd: REPO_ROOT
      })
      yield* Console.log("Push complete.")
    } finally {
      unlinkSync(tmpFile)
    }
  })
)

export const dbCommand = Command.make("db", {}).pipe(
  Command.withSubcommands([pullCommand, pushCommand])
)
