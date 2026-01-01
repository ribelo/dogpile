import { Command, Args } from "@effect/cli"
import { Effect, Option } from "effect"
import { execSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Options } from "@effect/cli"

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

export const scrapeCommand = Command.make("scrape", {}).pipe(
  Command.withSubcommands([listCommand, runCommand, processCommand])
)
