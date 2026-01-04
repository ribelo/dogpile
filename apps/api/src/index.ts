import { Effect } from "effect"
import { drizzle } from "drizzle-orm/d1"
import { dogs, shelters, syncLogs } from "@dogpile/db"
import { eq, desc, and, like, sql, SQL, inArray } from "drizzle-orm"
import { DatabaseError, R2Error, QueueError } from "./errors"

interface Env {
  DB: D1Database
  KV: KVNamespace
  PHOTOS_ORIGINAL: R2Bucket
  PHOTOS_GENERATED: R2Bucket
  VECTORIZE: VectorizeIndex
  OPENROUTER_API_KEY: string
  OPENROUTER_MODEL: string
  ENVIRONMENT: string
  R2_PUBLIC_DOMAIN?: string
  IMAGE_QUEUE?: Queue<{ dogId: string; urls: string[] }>
  REINDEX_QUEUE?: Queue<any>
  ADMIN_KEY?: string
}

/**
 * TODO: Centralize ReindexJob type to avoid duplication
 */
interface ReindexJob {
  type: "upsert" | "delete"
  dogId: string
  description?: string
  metadata?: {
    shelterId?: string
    city?: string | undefined
    size?: string
    ageMonths?: number
    sex?: string | undefined
  }
}

type ApiError = DatabaseError | R2Error | QueueError

function buildSearchText(dog: any): string {
  const parts: string[] = [`Pies ${dog.name}`]
  
  if (dog.ageEstimate?.months) {
    const months = dog.ageEstimate.months
    if (months < 12) {
      parts.push(`szczeniak ${months} miesięcy`)
    } else {
      const years = Math.floor(months / 12)
      parts.push(`${years} ${years === 1 ? 'rok' : years < 5 ? 'lata' : 'lat'}`)
    }
  }
  
  if (dog.sizeEstimate?.value) {
    const sizeMap: Record<string, string> = { small: "mały pies", medium: "średni pies", large: "duży pies" }
    parts.push(sizeMap[dog.sizeEstimate.value] || dog.sizeEstimate.value)
  }
  
  if (dog.breedEstimates?.length) {
    parts.push(`rasa ${dog.breedEstimates[0].breed.replace(/_/g, " ")}`)
  }
  
  if (dog.locationCity) parts.push(`z miasta ${dog.locationCity}`)
  if (dog.sex === "male") parts.push("samiec")
  if (dog.sex === "female") parts.push("samica")
  if (dog.personalityTags?.length) parts.push(dog.personalityTags.join(", "))
  if (dog.generatedBio) parts.push(dog.generatedBio)
  
  return parts.join(". ")
}

type RouteHandler = (
  request: Request,
  env: Env,
  params: Record<string, string>
) => Effect.Effect<Response, ApiError, never>

interface Route {
  method: string
  pattern: URLPattern
  handler: RouteHandler
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

const json = (data: unknown, status = 200) => {
  const response = new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  })
  return Effect.succeed(response)
}

const routes: Route[] = [
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/health" }),
    handler: Effect.fn("api.health")(() => json({ status: "ok", timestamp: new Date().toISOString() })),
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/dogs" }),
    handler: Effect.fn("api.listDogs")(function* (req, env) {
      const url = new URL(req.url)
      const db = drizzle(env.DB)
      const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "20") || 20, 1), 100)
      const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0") || 0, 0)
      const validStatuses = ["available", "adopted", "removed", "reserved"]
      const statusParam = url.searchParams.get("status")
      const city = url.searchParams.get("city")
      const sex = url.searchParams.get("sex")
      const size = url.searchParams.get("size")

      const filters: SQL[] = []

      type DogStatus = "available" | "adopted" | "removed" | "reserved"
      if (statusParam !== "all") {
        const status = validStatuses.includes(statusParam ?? "") ? statusParam : "available"
        filters.push(eq(dogs.status, status as DogStatus))
      }

      if (city) {
        filters.push(sql`lower(${dogs.locationCity}) = lower(${city})`)
      }
      if (sex && ["male", "female", "unknown"].includes(sex)) {
        filters.push(eq(dogs.sex, sex as any))
      }
      if (size) {
        filters.push(sql`lower(json_extract(${dogs.sizeEstimate}, '$.value')) = lower(${size})`)
      }

      const results = yield* Effect.tryPromise({
        try: () =>
          db
            .select()
            .from(dogs)
            .where(filters.length > 0 ? and(...filters) : undefined)
            .orderBy(desc(dogs.createdAt))
            .limit(limit)
            .offset(offset)
            .all(),
        catch: (e) => new DatabaseError({ operation: "listDogs", cause: e })
      })

      return yield* json({ dogs: results ?? [], total: results?.length ?? 0 })
    }),
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/dogs/search" }),
    handler: Effect.fn("api.searchDogs")(function* (req, env) {
    const url = new URL(req.url)
    const query = url.searchParams.get("q")
    if (!query) {
      return yield* json({ error: "Missing q parameter" }, 400)
    }
    
    const city = url.searchParams.get("city")
    const size = url.searchParams.get("size")
    const sex = url.searchParams.get("sex")
    const parsedLimit = parseInt(url.searchParams.get("limit") || "10")
    const limit = Math.min(isNaN(parsedLimit) ? 10 : parsedLimit, 50)

    // Get embedding for query
    const embedding = yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: env.OPENROUTER_MODEL,
            input: [query],
          }),
        })
        const data = await response.json() as { data: [{ embedding: number[] }] }
        return data.data[0].embedding
      },
      catch: (e) => new DatabaseError({ operation: "get embedding", cause: e })
    })

    // Build metadata filter
    const filter: Record<string, string> = {}
    if (city) filter.city = city
    if (size) filter.size = size
    if (sex) filter.sex = sex

    // TODO: Add age range filtering when Vectorize supports numeric comparisons

    // Search Vectorize
    const results = yield* Effect.tryPromise({
      try: () => {
        const options: VectorizeQueryOptions = {
          topK: limit,
        }
        if (Object.keys(filter).length > 0) {
          options.filter = filter
        }
        return env.VECTORIZE.query(embedding, options)
      },
      catch: (e) => new DatabaseError({ operation: "vector search", cause: e })
    })

    // Hydrate from D1
    const db = drizzle(env.DB)
    const ids = results.matches.map(m => m.id)
    
    if (ids.length === 0) {
      return yield* json({ dogs: [], scores: [] })
    }

    const dogResults = yield* Effect.tryPromise({
      try: () => db.select().from(dogs).where(inArray(dogs.id, ids)).all(),
      catch: (e) => new DatabaseError({ operation: "hydrate dogs", cause: e })
    })

    // Sort by vector score
    const scoreMap = new Map(results.matches.map(m => [m.id, m.score]))
    dogResults.sort((a, b) => (scoreMap.get(b.id) || 0) - (scoreMap.get(a.id) || 0))

      return yield* json({
        dogs: dogResults,
        scores: dogResults.map(d => scoreMap.get(d.id) || 0)
      })
    }),
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/dogs/:id" }),
    handler: Effect.fn("api.getDog")(function* (_req, env, params) {
      const db = drizzle(env.DB)
      const result = yield* Effect.tryPromise({
        try: () => db.select().from(dogs).where(eq(dogs.id, params.id)).get(),
        catch: (e) => new DatabaseError({ operation: "getDog", cause: e })
      })
      if (!result) {
        return yield* json({ error: "Dog not found" }, 404)
      }
      return yield* json({
        ...result,
        isRemoved: result.status === "removed"
      })
    }),
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/shelters" }),
    handler: Effect.fn("api.listShelters")(function* (_req, env) {
      const db = drizzle(env.DB)
      const results = yield* Effect.tryPromise({
        try: () => db.select().from(shelters).all(),
        catch: (e) => new DatabaseError({ operation: "listShelters", cause: e })
      })
      return yield* json({ shelters: results })
    }),
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/photos/generated/:key" }),
    handler: Effect.fn("api.getGeneratedPhoto")(function* (_req, env, params) {
      const key = decodeURIComponent(params.key)
      const object = yield* Effect.tryPromise({
        try: () => env.PHOTOS_GENERATED.get(key),
        catch: (e) => new R2Error({ operation: "getGeneratedPhoto", cause: e })
      })
      
      if (!object) {
        return yield* json({ error: "Photo not found" }, 404)
      }
      
      const headers = new Headers()
      const contentType = object.httpMetadata?.contentType || (key.endsWith(".webp") ? "image/webp" : "image/png")
      headers.set("Content-Type", contentType)
      headers.set("Cache-Control", "public, max-age=31536000")
      headers.set("Access-Control-Allow-Origin", "*")
      
      return new Response(object.body, { headers })
    }),
  },
  {
    method: "POST",
    pattern: new URLPattern({ pathname: "/admin/sync-generated-photos" }),
    handler: Effect.fn("api.adminSyncGeneratedPhotos")(function* (req, env) {
      const publicDomain = "dogpile-generated.extropy.club"
      
      const listed = yield* Effect.tryPromise({
        try: () => env.PHOTOS_GENERATED.list(),
        catch: (e) => new R2Error({ operation: "listGeneratedPhotos", cause: e })
      })
      
      const updates: { fingerprint: string; url: string }[] = []
      
      for (const obj of listed.objects) {
        const match = obj.key.match(/^(.+)-nose\.png$/)
        if (match) {
          const fingerprint = match[1]
          const url = `https://${publicDomain}/${obj.key}`
          updates.push({ fingerprint, url })
        }
      }
      
      let updated = 0
      for (const { fingerprint, url } of updates) {
        const result = yield* Effect.tryPromise({
          try: () =>
            env.DB.prepare(
              `UPDATE dogs SET photos_generated = ? WHERE fingerprint = ?`
            ).bind(JSON.stringify([url]), fingerprint).run(),
          catch: (e) => new DatabaseError({ operation: "syncPhotosUpdate", cause: e })
        })
        if (result.meta.changes > 0) updated++
      }
      
      return yield* json({ 
        message: "Sync complete", 
        found: updates.length, 
        updated,
        sample: updates.slice(0, 3)
      })
    }),
  },
  {
   method: "POST",
   pattern: new URLPattern({ pathname: "/admin/backfill-images" }),
   handler: Effect.fn("api.adminBackfillImages")(function* (req, env) {
     const auth = req.headers.get("Authorization")
     if (!env.ADMIN_KEY || auth !== `Bearer ${env.ADMIN_KEY}`) {
       return yield* json({ error: "Unauthorized" }, 401)
     }

     if (!env.IMAGE_QUEUE) {
       return yield* json({ error: "IMAGE_QUEUE not configured" }, 500)
     }

     const db = drizzle(env.DB)
     
     const allDogs = yield* Effect.tryPromise({
       try: () =>
         db.select({ id: dogs.id, photos: dogs.photos })
           .from(dogs)
           .where(eq(dogs.status, "available"))
           .all(),
       catch: (e) => new DatabaseError({ operation: "backfillListDogs", cause: e })
     })

     const jobs: { body: { dogId: string; urls: string[] } }[] = []

     for (const dog of allDogs) {
       const externalUrls = (dog.photos || []).filter((p: string) => p.startsWith("http"))
       if (externalUrls.length > 0) {
         jobs.push({ body: { dogId: dog.id, urls: externalUrls } })
       }
     }

     if (jobs.length > 0) {
       const batchSize = 100
       for (let i = 0; i < jobs.length; i += batchSize) {
         const chunk = jobs.slice(i, i + batchSize)
         yield* Effect.tryPromise({
           try: () => env.IMAGE_QUEUE!.sendBatch(chunk),
           catch: (e) => new QueueError({ operation: "sendBatch", cause: e })
         })
       }
     }

     return yield* json({
       status: "ok",
       scanned: allDogs.length,
       enqueued: jobs.length
     })
   }),
 },
  {
    method: "POST",
    pattern: new URLPattern({ pathname: "/admin/reindex" }),
    handler: Effect.fn("api.reindex")(function* (req, env) {
      const authHeader = req.headers.get("Authorization")
      if (authHeader !== `Bearer ${env.ADMIN_KEY}`) {
        return yield* json({ error: "Unauthorized" }, 401)
      }

      if (!env.REINDEX_QUEUE) {
        return yield* json({ error: "REINDEX_QUEUE not configured" }, 500)
      }

      const url = new URL(req.url)
      const parsedLimit = parseInt(url.searchParams.get("limit") || "10000")
      const limit = Math.min(isNaN(parsedLimit) ? 10000 : parsedLimit, 10000)

      const db = drizzle(env.DB)
      const allDogs = yield* Effect.tryPromise({
        try: () => db.select().from(dogs).where(eq(dogs.status, "available")).limit(limit).all(),
        catch: (e) => new DatabaseError({ operation: "fetch all dogs", cause: e })
      })

      // Queue reindex jobs in batches
      const jobs: { body: ReindexJob }[] = allDogs.map(dog => {
        return {
          body: {
            type: "upsert" as const,
            dogId: dog.id,
            description: buildSearchText(dog),
            metadata: {
              shelterId: dog.shelterId,
              city: dog.locationCity || undefined,
              size: (dog.sizeEstimate as any)?.value || undefined,
              ageMonths: (dog.ageEstimate as any)?.months || undefined,
              sex: dog.sex || undefined,
            }
          }
        }
      })

      const BATCH_SIZE = 100
      for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
        const chunk = jobs.slice(i, i + BATCH_SIZE)
        yield* Effect.tryPromise({
          try: () => env.REINDEX_QUEUE!.sendBatch(chunk),
          catch: (e) => new QueueError({ operation: "sendBatch reindex", cause: e })
        })
      }

      return yield* json({ queued: jobs.length })
    }),
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/admin/sync-stats" }),
    handler: Effect.fn("api.syncStats")(function* (req, env) {
      const authHeader = req.headers.get("Authorization")
      if (authHeader !== `Bearer ${env.ADMIN_KEY}`) {
        return yield* json({ error: "Unauthorized" }, 401)
      }

      const db = drizzle(env.DB)
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

      const logs = yield* Effect.tryPromise({
        try: () =>
          db.select().from(syncLogs)
            .where(sql`${syncLogs.startedAt} > ${since.getTime()}`)
            .orderBy(desc(syncLogs.startedAt))
            .all(),
        catch: (e) => new DatabaseError({ operation: "get sync stats", cause: e })
      })

      const total = logs.length
      const successful = logs.filter(l => l.errors.length === 0).length
      const avgAdded = logs.reduce((sum, l) => sum + l.dogsAdded, 0) / (total || 1)
      const avgUpdated = logs.reduce((sum, l) => sum + l.dogsUpdated, 0) / (total || 1)
      const avgRemoved = logs.reduce((sum, l) => sum + l.dogsRemoved, 0) / (total || 1)
      const recentErrors = logs.flatMap(l => l.errors).slice(0, 10)

      return yield* json({
        period: "24h",
        totalSyncs: total,
        successRate: total ? (successful / total) : 1,
        averages: { added: avgAdded, updated: avgUpdated, removed: avgRemoved },
        recentErrors,
      })
    }),
  },
]

const notFound = () => json({ error: "Not Found" }, 404)

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders })
    }

    const url = request.url
    const method = request.method.toUpperCase()

    for (const route of routes) {
      if (route.method !== method) continue
      const match = route.pattern.exec(url)
      if (match) {
        const params = match.pathname.groups as Record<string, string>
        const program = route.handler(request, env, params).pipe(
          Effect.catchAll((error) => {
            console.error(`API Error [${error._tag}]:`, error)
            return json({
              error: error._tag,
              message: "An internal error occurred",
              operation: (error as any).operation
            }, 500)
          })
        )
        return Effect.runPromise(program)
      }
    }

    return Effect.runPromise(notFound() as any)
  },
}
