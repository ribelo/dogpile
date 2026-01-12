import { Command, Args } from "@effect/cli"
import { Console, Effect, Option } from "effect"
import { execSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Options } from "@effect/cli"
import { UnrecoverableError } from "../errors"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCRAPERS_DIR = path.resolve(__dirname, "../../../scrapers")

const runScrapersCli = (args: string[]) =>
  Effect.sync(() => {
    execSync(`bun run cli ${args.join(" ")}`, {
      cwd: SCRAPERS_DIR,
      stdio: "inherit",
    })
  })

const listCommand = Command.make("list", {}, () => runScrapersCli(["list"]))
const seedCommand = Command.make("seed", {}, () => runScrapersCli(["seed"]))

const shelterIdArg = Args.text({ name: "shelter-id" })
const limitOpt = Options.integer("limit").pipe(Options.optional)
const concurrencyOpt = Options.integer("concurrency").pipe(Options.optional)
const generatePhotosOpt = Options.boolean("generate-photos").pipe(Options.optional)

const runCommand = Command.make("run", { shelterId: shelterIdArg, limit: limitOpt }, ({ shelterId, limit }) => {
  const args = ["run", shelterId]
  if (Option.isSome(limit)) args.push("--limit", String(limit.value))
  return runScrapersCli(args)
}
)

const processCommand = Command.make("process", {
  shelterId: shelterIdArg, 
  limit: limitOpt,
  concurrency: concurrencyOpt,
  generatePhotos: generatePhotosOpt,
}, ({ shelterId, limit, concurrency, generatePhotos }) => {
  const args = ["process", shelterId]
  if (Option.isSome(limit)) args.push("--limit", String(limit.value))
  if (Option.isSome(concurrency)) args.push("--concurrency", String(concurrency.value))
  if (Option.isSome(generatePhotos) && generatePhotos.value) args.push("--generate-photos")
  return runScrapersCli(args)
}
)

const apiUrlOpt = Options.text("api-url").pipe(Options.withDefault("http://localhost:8787"))
const adminKeyOpt = Options.text("admin-key").pipe(Options.optional)
const enqueueConcurrencyOpt = Options.integer("concurrency").pipe(Options.optional)
const includeInactiveOpt = Options.boolean("include-inactive").pipe(Options.optional)

type ShelterRow = { id: string; name: string; active: boolean }

const enqueueAllCommand = Command.make("enqueue-all", {
  apiUrl: apiUrlOpt,
  adminKey: adminKeyOpt,
  concurrency: enqueueConcurrencyOpt,
  includeInactive: includeInactiveOpt,
}, ({ apiUrl, adminKey, concurrency, includeInactive }) =>
  Effect.gen(function* () {
    const key =
      Option.getOrElse(adminKey, () => process.env.ADMIN_KEY ?? process.env.PUBLIC_ADMIN_KEY ?? "dev-admin-key-123")

    const enqueueConcurrency = Math.max(1, Math.min(20, Option.getOrElse(concurrency, () => 5)))
    const shouldIncludeInactive = Option.getOrElse(includeInactive, () => false)

    yield* Console.log(`Fetching shelters from ${apiUrl}...`)

    const shelters = yield* Effect.tryPromise({
      try: async () => {
        const res = await fetch(`${apiUrl}/admin/shelters`, {
          headers: { Authorization: `Bearer ${key}` },
        })
        if (!res.ok) {
          const body = await res.text().catch(() => "")
          throw new UnrecoverableError({
            reason: `Failed to fetch shelters: ${res.status} ${res.statusText} ${body}`.trim(),
          })
        }
        const json = await res.json() as { shelters: ShelterRow[] }
        return json.shelters ?? []
      },
      catch: (e) =>
        e instanceof UnrecoverableError
          ? e
          : new UnrecoverableError({ reason: `Failed to fetch shelters: ${String(e)}` })
    })

    const selected = shelters.filter((s) => shouldIncludeInactive ? true : s.active)
    if (selected.length === 0) {
      yield* Console.log("No shelters to enqueue.")
      return
    }

    yield* Console.log(`Enqueuing ${selected.length} shelter(s) (concurrency=${enqueueConcurrency})...`)

    const results = yield* Effect.forEach(
      selected,
      (shelter) =>
        Effect.tryPromise({
          try: async () => {
            const res = await fetch(`${apiUrl}/admin/shelters/${shelter.id}/scrape`, {
              method: "POST",
              headers: { Authorization: `Bearer ${key}` },
            })
            if (!res.ok) {
              const body = await res.text().catch(() => "")
              throw new UnrecoverableError({
                reason: `${shelter.name}: ${res.status} ${res.statusText} ${body}`.trim(),
              })
            }
            return shelter
          },
          catch: (e) =>
            e instanceof UnrecoverableError
              ? e
              : new UnrecoverableError({ reason: String(e) })
        }).pipe(
          Effect.map((s) => ({ type: "ok" as const, shelter: s })),
          Effect.catchAll((err) =>
            Effect.succeed({
              type: "error" as const,
              error: err.reason,
            })
          ),
        ),
      { concurrency: enqueueConcurrency }
    )

    const ok = results.filter((r) => r.type === "ok").length
    const errors = results.flatMap((r) => r.type === "error" ? [r.error] : [])

    yield* Console.log(`Queued: ${ok}/${selected.length}`)
    if (errors.length > 0) {
      yield* Console.log(`Errors: ${errors.length}`)
      for (const e of errors.slice(0, 10)) {
        yield* Console.log(`  - ${e}`)
      }
      if (errors.length > 10) {
        yield* Console.log(`  ...and ${errors.length - 10} more`)
      }
    }

    yield* Console.log("Monitor progress in /admin/queue and /admin/dogs?status=pending.")
  })
)

export const scrapeCommand = Command.make("scrape", {}).pipe(
  Command.withSubcommands([listCommand, seedCommand, runCommand, processCommand, enqueueAllCommand])
)
