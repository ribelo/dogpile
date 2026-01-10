import { Schema } from "effect"

export const ShelterStatus = Schema.Literal("active", "inactive", "error")
export type ShelterStatus = typeof ShelterStatus.Type

export const Shelter = Schema.Struct({
  id: Schema.String,
  slug: Schema.String,
  name: Schema.String,
  url: Schema.String,
  city: Schema.String,
  region: Schema.NullOr(Schema.String),
  lat: Schema.NullOr(Schema.Number),
  lng: Schema.NullOr(Schema.Number),
  phone: Schema.NullOr(Schema.String),
  email: Schema.NullOr(Schema.String),
  active: Schema.Boolean,
  status: ShelterStatus,
  lastSync: Schema.NullOr(Schema.Date),
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
