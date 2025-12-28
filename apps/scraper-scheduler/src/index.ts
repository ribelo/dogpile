import { Effect } from "effect"
import { drizzle } from "drizzle-orm/d1"
import { shelters } from "@dogpile/db"
import { lt, eq, or, isNull } from "drizzle-orm"

interface Env {
  DB: D1Database
  SCRAPE_QUEUE: Queue<ScrapeJob>
  SYNC_INTERVAL_MINUTES: string
}

interface ScrapeJob {
  shelterId: string
  scraperId: string
  baseUrl: string
}

export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const program = Effect.gen(function* () {
      const db = drizzle(env.DB)
      const intervalMinutes = parseInt(env.SYNC_INTERVAL_MINUTES, 10) || 60
      const threshold = new Date(Date.now() - intervalMinutes * 60 * 1000)

      const dueShelters = yield* Effect.tryPromise({
        try: () =>
          db
            .select()
            .from(shelters)
            .where(
              or(
                isNull(shelters.lastSync),
                lt(shelters.lastSync, threshold),
              )
            )
            .all(),
        catch: (error) => new Error(`Failed to fetch shelters: ${error}`),
      })

      yield* Effect.logInfo(`Found ${dueShelters.length} shelters due for sync`)

      const jobs: ScrapeJob[] = dueShelters.map((shelter) => ({
        shelterId: shelter.id,
        scraperId: shelter.scraperId,
        baseUrl: shelter.url,
      }))

      if (jobs.length > 0) {
        yield* Effect.tryPromise({
          try: () => env.SCRAPE_QUEUE.sendBatch(jobs.map((job) => ({ body: job }))),
          catch: (error) => new Error(`Failed to enqueue jobs: ${error}`),
        })
        yield* Effect.logInfo(`Enqueued ${jobs.length} scrape jobs`)
      }
    })

    ctx.waitUntil(Effect.runPromise(program))
  },
}
