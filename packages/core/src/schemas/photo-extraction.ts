import { Schema } from "effect"
import { BreedEstimate, SizeEstimate, FurLength, FurType, ColorPattern, EarType, TailType } from "../domain/estimations.js"

export const PhotoExtractionSchema = Schema.Struct({
  breedEstimates: Schema.Array(BreedEstimate),
  sizeEstimate: Schema.NullOr(SizeEstimate),
  ageCategory: Schema.NullOr(Schema.Literal("puppy", "young", "adult", "senior")),
  furLength: Schema.NullOr(FurLength),
  furType: Schema.NullOr(FurType),
  colorPrimary: Schema.NullOr(Schema.String),
  colorSecondary: Schema.NullOr(Schema.String),
  colorPattern: Schema.NullOr(ColorPattern),
  earType: Schema.NullOr(EarType),
  tailType: Schema.NullOr(TailType)
})

export type PhotoExtraction = typeof PhotoExtractionSchema.Type
