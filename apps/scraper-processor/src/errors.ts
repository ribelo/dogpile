import { Schema } from "effect"

export class HttpError extends Schema.TaggedError<HttpError>()("HttpError", {
  url: Schema.String,
  status: Schema.Number,
  message: Schema.String,
}) {}

export class DatabaseError extends Schema.TaggedError<DatabaseError>()("DatabaseError", {
  operation: Schema.String,
  cause: Schema.Defect,
}) {}

export class QueueError extends Schema.TaggedError<QueueError>()("QueueError", {
  operation: Schema.String,
  cause: Schema.Defect,
}) {}

export class ImageHandlerError extends Schema.TaggedError<ImageHandlerError>()("ImageHandlerError", {
  operation: Schema.String,
  cause: Schema.Defect,
}) {}
