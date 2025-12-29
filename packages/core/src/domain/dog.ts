import { Schema } from "effect"
import {
  BreedEstimate,
  SizeEstimate,
  AgeEstimate,
  WeightEstimate,
  FurLength,
  FurType,
  ColorPattern,
  EarType,
  TailType,
} from "./estimations.js"

export const DogSex = Schema.Literal("male", "female", "unknown")
export type DogSex = typeof DogSex.Type

export const DogStatus = Schema.Literal("available", "adopted", "reserved", "removed")
export type DogStatus = typeof DogStatus.Type

export const Dog = Schema.Struct({
  id: Schema.String,
  shelterId: Schema.String,
  externalId: Schema.String,

  // Basic (from text extraction)
  name: Schema.String,
  sex: Schema.NullOr(DogSex),

  // Location (where dog physically is)
  locationName: Schema.NullOr(Schema.String),
  locationCity: Schema.NullOr(Schema.String),
  locationLat: Schema.NullOr(Schema.Number),
  locationLng: Schema.NullOr(Schema.Number),
  isFoster: Schema.NullOr(Schema.Boolean),

  // AI estimations
  breedEstimates: Schema.Array(BreedEstimate),
  sizeEstimate: Schema.NullOr(SizeEstimate),
  ageEstimate: Schema.NullOr(AgeEstimate),
  weightEstimate: Schema.NullOr(WeightEstimate),

  // AI text extraction
  personalityTags: Schema.Array(Schema.String),

  // Health (often missing)
  vaccinated: Schema.NullOr(Schema.Boolean),
  sterilized: Schema.NullOr(Schema.Boolean),
  chipped: Schema.NullOr(Schema.Boolean),

  // Compatibility (often missing)
  goodWithKids: Schema.NullOr(Schema.Boolean),
  goodWithDogs: Schema.NullOr(Schema.Boolean),
  goodWithCats: Schema.NullOr(Schema.Boolean),

  // AI photo extraction
  furLength: Schema.NullOr(FurLength),
  furType: Schema.NullOr(FurType),
  colorPrimary: Schema.NullOr(Schema.String),
  colorSecondary: Schema.NullOr(Schema.String),
  colorPattern: Schema.NullOr(ColorPattern),
  earType: Schema.NullOr(EarType),
  tailType: Schema.NullOr(TailType),

  // Photos (R2 keys)
  photos: Schema.Array(Schema.String),
  photosGenerated: Schema.Array(Schema.String),

  // Meta
  fingerprint: Schema.String,
  rawDescription: Schema.NullOr(Schema.String),
  generatedBio: Schema.NullOr(Schema.String),
  lastSeenAt: Schema.NullOr(Schema.Date),
  sourceUrl: Schema.NullOr(Schema.String),
  urgent: Schema.Boolean,
  status: DogStatus,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
})

export type Dog = typeof Dog.Type
