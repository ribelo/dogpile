import { Schema } from "effect"
import { BreedEstimate, SizeEstimate, AgeEstimate, WeightEstimate } from "../domain/estimations.js"

export const TextExtractionSchema = Schema.Struct({
  name: Schema.NullOr(Schema.String),
  sex: Schema.NullOr(Schema.Literal("male", "female", "unknown")),
  ageEstimate: Schema.NullOr(AgeEstimate),
  breedEstimates: Schema.Array(BreedEstimate),
  sizeEstimate: Schema.NullOr(SizeEstimate),
  weightEstimate: Schema.NullOr(WeightEstimate),
  personalityTags: Schema.Array(Schema.String),
  vaccinated: Schema.NullOr(Schema.Boolean),
  sterilized: Schema.NullOr(Schema.Boolean),
  chipped: Schema.NullOr(Schema.Boolean),
  goodWithKids: Schema.NullOr(Schema.Boolean),
  goodWithDogs: Schema.NullOr(Schema.Boolean),
  goodWithCats: Schema.NullOr(Schema.Boolean),
  locationHints: Schema.Struct({
    isFoster: Schema.NullOr(Schema.Boolean),
    cityMention: Schema.NullOr(Schema.String)
  }),
  urgent: Schema.Boolean
})

export type TextExtraction = typeof TextExtractionSchema.Type
