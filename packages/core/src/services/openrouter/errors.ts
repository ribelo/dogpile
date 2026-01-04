import { Schema } from "effect"

export class OpenRouterError extends Schema.TaggedError<OpenRouterError>()("OpenRouterError", {
  status: Schema.Number,
  body: Schema.Unknown,
  code: Schema.String,
  message: Schema.String,
}) {}

export class RateLimitError extends Schema.TaggedError<RateLimitError>()("RateLimitError", {
  status: Schema.Number,
  retryAfter: Schema.NullOr(Schema.Number),
  message: Schema.String,
}) {}

export class SchemaValidationError extends Schema.TaggedError<SchemaValidationError>()("SchemaValidationError", {
  issues: Schema.Array(Schema.Unknown),
  message: Schema.String,
}) {}

export class NetworkError extends Schema.TaggedError<NetworkError>()("NetworkError", {
  cause: Schema.Unknown,
  message: Schema.String,
}) {}
