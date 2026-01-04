import { Schema } from "effect"

export class R2Error extends Schema.TaggedError<R2Error>()("R2Error", {
  operation: Schema.String,
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

export class SharpError extends Schema.TaggedError<SharpError>()("SharpError", {
  operation: Schema.String,
  cause: Schema.Unknown,
}) {}

export class UnrecoverableError extends Schema.TaggedError<UnrecoverableError>()("UnrecoverableError", {
  reason: Schema.String,
}) {}
