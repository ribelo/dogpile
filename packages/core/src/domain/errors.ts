import { Schema } from "effect"

export class ScrapeError extends Schema.TaggedError<ScrapeError>()("ScrapeError", {
  shelterId: Schema.String,
  cause: Schema.Unknown,
  message: Schema.String,
}) {}

export class ParseError extends Schema.TaggedError<ParseError>()("ParseError", {
  shelterId: Schema.String,
  cause: Schema.Unknown,
  message: Schema.String,
}) {}

export class EmbeddingError extends Schema.TaggedError<EmbeddingError>()("EmbeddingError", {
  cause: Schema.Unknown,
  message: Schema.String,
}) {}

export class StorageError extends Schema.TaggedError<StorageError>()("StorageError", {
  operation: Schema.Literal("read", "write", "delete"),
  cause: Schema.Unknown,
  message: Schema.String,
}) {}

export class NotFoundError extends Schema.TaggedError<NotFoundError>()("NotFoundError", {
  entity: Schema.String,
  id: Schema.String,
}) {}
