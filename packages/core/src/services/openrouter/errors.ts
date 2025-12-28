import { Data } from "effect"

export class OpenRouterError extends Data.TaggedError("OpenRouterError")<{
  readonly status: number
  readonly body: unknown
  readonly code: string
  readonly message: string
}> {}

export class RateLimitError extends Data.TaggedError("RateLimitError")<{
  readonly status: number
  readonly retryAfter: number | null
  readonly message: string
}> {}

export class SchemaValidationError extends Data.TaggedError("SchemaValidationError")<{
  readonly issues: readonly unknown[]
  readonly message: string
}> {}

export class NetworkError extends Data.TaggedError("NetworkError")<{
  readonly cause: unknown
  readonly message: string
}> {}
