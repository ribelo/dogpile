import { Config, Context, Effect, Layer, Schedule, Redacted } from "effect"
import type { ResponsesRequest, ResponsesResult, EmbeddingsRequest, EmbeddingsResult, ChatCompletionsRequest, ChatCompletionsResult } from "./types.js"
import { NetworkError, OpenRouterError, RateLimitError } from "./errors.js"

const OpenRouterConfig = Config.all({
  apiKey: Config.redacted("OPENROUTER_API_KEY"),
  baseUrl: Config.string("OPENROUTER_BASE_URL").pipe(
    Config.withDefault("https://openrouter.ai/api/v1")
  ),
})

const retrySchedule = Schedule.exponential("200 millis").pipe(
  Schedule.jittered,
  Schedule.compose(Schedule.recurs(5))
)

type ClientError = OpenRouterError | RateLimitError | NetworkError

export class OpenRouterClient extends Context.Tag("@dogpile/OpenRouterClient")<
  OpenRouterClient,
  {
    readonly responses: (
      request: ResponsesRequest
    ) => Effect.Effect<ResponsesResult, ClientError>
    readonly embeddings: (
      request: EmbeddingsRequest
    ) => Effect.Effect<EmbeddingsResult, ClientError>
    readonly chatCompletions: (
      request: ChatCompletionsRequest
    ) => Effect.Effect<ChatCompletionsResult, ClientError>
  }
>() {
  static readonly Live = Layer.effect(
    this,
    Effect.gen(function* () {
      const { apiKey, baseUrl } = yield* OpenRouterConfig

      const call = <T>(
        endpoint: string,
        body: unknown
      ): Effect.Effect<T, ClientError> => {
        const doFetch = Effect.tryPromise({
          try: async (signal) => {
            const res = await globalThis.fetch(`${baseUrl}${endpoint}`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${Redacted.value(apiKey)}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://dogpile.extropy.club",
              },
              body: JSON.stringify(body, null, 2),
              signal,
            })
            return res
          },
          catch: (cause) =>
            new NetworkError({ cause, message: "Failed to connect to OpenRouter" }),
        })

        const handleResponse = (res: Response): Effect.Effect<T, ClientError> => {
          if (res.ok) {
            return Effect.tryPromise({
              try: () => res.json() as Promise<T>,
              catch: (cause) =>
                new NetworkError({ cause, message: "Failed to parse response" }),
            })
          }

          if (res.status === 429) {
            const retryAfter = res.headers.get("Retry-After")
            return Effect.fail(
              new RateLimitError({
                status: 429,
                retryAfter: retryAfter ? parseInt(retryAfter, 10) : null,
                message: "Rate limit exceeded",
              })
            )
          }

          return Effect.tryPromise({
            try: async () => {
              try {
                return await res.json()
              } catch {
                return { error: "Unknown error" }
              }
            },
            catch: () =>
              new OpenRouterError({
                status: res.status,
                body: null,
                code: String(res.status),
                message: `OpenRouter API error: ${res.status} ${res.statusText}`,
              }),
          }).pipe(
            Effect.flatMap((responseBody) =>
              Effect.fail(
                new OpenRouterError({
                  status: res.status,
                  body: responseBody,
                  code: String(res.status),
                  message: `OpenRouter API error: ${res.status} ${res.statusText}`,
                })
              )
            )
          )
        }

        return doFetch.pipe(
          Effect.flatMap(handleResponse),
          Effect.retry(
            Schedule.whileInput(retrySchedule, (err: ClientError) =>
              err._tag === "RateLimitError" ||
              (err._tag === "OpenRouterError" && err.status >= 500)
            )
          )
        )
      }

      return {
        responses: Effect.fn("OpenRouterClient.responses")((request: ResponsesRequest) =>
          call<ResponsesResult>("/responses", request)
        ),
        embeddings: Effect.fn("OpenRouterClient.embeddings")((request: EmbeddingsRequest) =>
          call<EmbeddingsResult>("/embeddings", request)
        ),
        chatCompletions: Effect.fn("OpenRouterClient.chatCompletions")(
          (request: ChatCompletionsRequest) => call<ChatCompletionsResult>("/chat/completions", request)
        ),
      }
    })
  )
}
