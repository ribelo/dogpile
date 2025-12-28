import { Schema } from "effect"

export const ShelterStatus = Schema.Literal("active", "inactive", "error")
export type ShelterStatus = typeof ShelterStatus.Type

export const Shelter = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  slug: Schema.String,
  url: Schema.String,
  city: Schema.String,
  region: Schema.NullOr(Schema.String),
  scraperId: Schema.String,
  lastSync: Schema.NullOr(Schema.Date),
  status: ShelterStatus,
})

export type Shelter = typeof Shelter.Type

export const SyncLog = Schema.Struct({
  id: Schema.String,
  shelterId: Schema.String,
  startedAt: Schema.Date,
  finishedAt: Schema.NullOr(Schema.Date),
  dogsAdded: Schema.Number,
  dogsUpdated: Schema.Number,
  dogsRemoved: Schema.Number,
  errors: Schema.Array(Schema.String),
})

export type SyncLog = typeof SyncLog.Type
