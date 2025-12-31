import { Effect } from "effect"
import { drizzle } from "drizzle-orm/d1"
import { dogs, shelters } from "@dogpile/db"
import { eq, desc, and, like, sql } from "drizzle-orm"

interface Env {
  DB: D1Database
  KV: KVNamespace
  PHOTOS_ORIGINAL: R2Bucket
  PHOTOS_GENERATED: R2Bucket
  VECTORIZE: VectorizeIndex
  OPENROUTER_API_KEY: string
  ENVIRONMENT: string
  R2_PUBLIC_DOMAIN?: string
}

type RouteHandler = (
  request: Request,
  env: Env,
  params: Record<string, string>
) => Effect.Effect<Response, never, never>

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
    handler: () => json({ status: "ok", timestamp: new Date().toISOString() }),
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/dogs" }),
    handler: (req, env) => Effect.gen(function* () {
      const url = new URL(req.url)
      const db = drizzle(env.DB)
      const limit = parseInt(url.searchParams.get("limit") ?? "20")
      const offset = parseInt(url.searchParams.get("offset") ?? "0")
      const status = (url.searchParams.get("status") ?? "available") as any

      const results = yield* Effect.promise(() =>
        db
          .select()
          .from(dogs)
          .where(eq(dogs.status, status))
          .orderBy(desc(dogs.createdAt))
          .limit(limit)
          .offset(offset)
          .all()
      )

      return yield* json({ dogs: results, total: results.length })
    }),
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/dogs/:id" }),
    handler: (_req, env, params) => Effect.gen(function* () {
      const db = drizzle(env.DB)
      const result = yield* Effect.promise(() =>
        db.select().from(dogs).where(eq(dogs.id, params.id)).get()
      )
      if (!result) {
        return yield* json({ error: "Dog not found" }, 404)
      }
      return yield* json(result)
    }),
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/shelters" }),
    handler: (_req, env) => Effect.gen(function* () {
      const db = drizzle(env.DB)
      const results = yield* Effect.promise(() => db.select().from(shelters).all())
      return yield* json({ shelters: results })
    }),
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/dogs/search" }),
    handler: (req, env) => Effect.gen(function* () {
      const url = new URL(req.url)
      const query = url.searchParams.get("q")
      if (!query) {
        return yield* json({ error: "Missing q parameter" }, 400)
      }

      const db = drizzle(env.DB)
      // For now, just return text search results
      // TODO: Integrate with Vectorize when EmbeddingService is wired
      const results = yield* Effect.promise(() =>
        db
          .select()
          .from(dogs)
          .where(like(dogs.generatedBio, `%${query}%`))
          .limit(10)
          .all()
      )

      return yield* json({ dogs: results, scores: results.map(() => 1.0) })
    }),
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/photos/generated/:key" }),
    handler: (_req, env, params) => Effect.gen(function* () {
      const key = decodeURIComponent(params.key)
      const object = yield* Effect.promise(() => env.PHOTOS_GENERATED.get(key))
      
      if (!object) {
        return yield* json({ error: "Photo not found" }, 404)
      }
      
      const headers = new Headers()
      headers.set("Content-Type", object.httpMetadata?.contentType || "image/png")
      headers.set("Cache-Control", "public, max-age=31536000")
      headers.set("Access-Control-Allow-Origin", "*")
      
      return new Response(object.body, { headers })
    }),
  },
  {
    method: "POST",
    pattern: new URLPattern({ pathname: "/admin/sync-generated-photos" }),
    handler: (req, env) => Effect.gen(function* () {
      const publicDomain = "dogpile-generated.extropy.club"
      
      const listed = yield* Effect.promise(() => env.PHOTOS_GENERATED.list())
      
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
        const result = yield* Effect.promise(() =>
          env.DB.prepare(
            `UPDATE dogs SET photos_generated = ? WHERE fingerprint = ?`
          ).bind(JSON.stringify([url]), fingerprint).run()
        )
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
        return Effect.runPromise(route.handler(request, env, params))
      }
    }

    return Effect.runPromise(notFound())
  },
}
