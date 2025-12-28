import { Data } from "effect"

export class ScrapeError extends Data.TaggedError("ScrapeError")<{
  readonly shelterId: string
  readonly cause: unknown
  readonly message: string
}> {}

export class ParseError extends Data.TaggedError("ParseError")<{
  readonly shelterId: string
  readonly cause: unknown
  readonly message: string
}> {}

export class EmbeddingError extends Data.TaggedError("EmbeddingError")<{
  readonly cause: unknown
  readonly message: string
}> {}

export class StorageError extends Data.TaggedError("StorageError")<{
  readonly operation: "read" | "write" | "delete"
  readonly cause: unknown
  readonly message: string
}> {}

export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly entity: string
  readonly id: string
}> {}
