import { Schema } from "effect"

export const DogSize = Schema.Literal("small", "medium", "large")
export type DogSize = typeof DogSize.Type

export const DogSex = Schema.Literal("male", "female", "unknown")
export type DogSex = typeof DogSex.Type

export const DogStatus = Schema.Literal("available", "adopted", "reserved", "removed")
export type DogStatus = typeof DogStatus.Type

export const Dog = Schema.Struct({
  id: Schema.String,
  shelterId: Schema.String,
  externalId: Schema.String,
  name: Schema.String,
  breed: Schema.NullOr(Schema.String),
  ageMonths: Schema.NullOr(Schema.Number),
  size: Schema.NullOr(DogSize),
  sex: DogSex,
  description: Schema.NullOr(Schema.String),
  personalityTags: Schema.Array(Schema.String),
  photos: Schema.Array(Schema.String),
  status: DogStatus,
  urgent: Schema.Boolean,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
  checksum: Schema.String,
})

export type Dog = typeof Dog.Type

export const CreateDog = Schema.Struct({
  shelterId: Schema.String,
  externalId: Schema.String,
  name: Schema.String,
  breed: Schema.NullOr(Schema.String),
  ageMonths: Schema.NullOr(Schema.Number),
  size: Schema.NullOr(DogSize),
  sex: DogSex,
  description: Schema.NullOr(Schema.String),
  personalityTags: Schema.Array(Schema.String),
  photos: Schema.Array(Schema.String),
  urgent: Schema.Boolean,
})

export type CreateDog = typeof CreateDog.Type
