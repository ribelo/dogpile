import { Effect } from "effect"

interface Env {
  DB: D1Database
  KV: KVNamespace
  PHOTOS_ORIGINAL: R2Bucket
  PHOTOS_GENERATED: R2Bucket
  VECTORIZE: VectorizeIndex
  ENVIRONMENT: string
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

const json = (data: unknown, status = 200) =>
  Effect.succeed(
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  )

const routes: Route[] = [
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/health" }),
    handler: () => json({ status: "ok", timestamp: new Date().toISOString() }),
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/dogs" }),
    handler: () => json({ dogs: [], total: 0 }),
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/dogs/:id" }),
    handler: (_req, _env, params) => json({ id: params.id, error: "Not implemented" }, 501),
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/shelters" }),
    handler: () => json({ shelters: [] }),
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/shelters/:slug" }),
    handler: (_req, _env, params) => json({ slug: params.slug, error: "Not implemented" }, 501),
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/search" }),
    handler: () => json({ results: [], total: 0 }),
  },
]

const notFound = () => json({ error: "Not Found" }, 404)

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
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
