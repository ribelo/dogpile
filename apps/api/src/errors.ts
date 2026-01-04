import { Schema } from "effect"

export class DatabaseError extends Schema.TaggedError<DatabaseError>()("DatabaseError", {
  operation: Schema.String,
  cause: Schema.Defect,
}) {}

export class R2Error extends Schema.TaggedError<R2Error>()("R2Error", {
  operation: Schema.String,
  cause: Schema.Defect,
}) {}

export class QueueError extends Schema.TaggedError<QueueError>()("QueueError", {
  operation: Schema.String,
  cause: Schema.Defect,
}) {}
