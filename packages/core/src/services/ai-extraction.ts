import { Context, Effect, Layer, Schema } from "effect"
import type {
  BreedEstimate,
  SizeEstimate,
  AgeEstimate,
  WeightEstimate,
  FurLength,
  FurType,
  ColorPattern,
  EarType,
  TailType,
} from "../domain/estimations.js"
import type { DogSex } from "../domain/dog.js"

export interface TextExtractionResult {
  readonly name: string | null
  readonly sex: DogSex | null
  readonly description: string | null
  readonly locationName: string | null
  readonly locationCity: string | null
  readonly isFoster: boolean | null
  readonly breedEstimates: readonly BreedEstimate[]
  readonly sizeEstimate: SizeEstimate | null
  readonly ageEstimate: AgeEstimate | null
  readonly weightEstimate: WeightEstimate | null
  readonly personalityTags: readonly string[]
  readonly vaccinated: boolean | null
  readonly sterilized: boolean | null
  readonly chipped: boolean | null
  readonly goodWithKids: boolean | null
  readonly goodWithDogs: boolean | null
  readonly goodWithCats: boolean | null
  readonly urgent: boolean
}

export interface PhotoExtractionResult {
  readonly breedEstimates: readonly BreedEstimate[]
  readonly sizeEstimate: SizeEstimate | null
  readonly ageEstimate: AgeEstimate | null
  readonly weightEstimate: WeightEstimate | null
  readonly furLength: FurLength | null
  readonly furType: FurType | null
  readonly colorPrimary: string | null
  readonly colorSecondary: string | null
  readonly colorPattern: ColorPattern | null
  readonly earType: EarType | null
  readonly tailType: TailType | null
}

export class ExtractionError extends Schema.TaggedError<ExtractionError>()("ExtractionError", {
  source: Schema.Literal("text", "photo"),
  cause: Schema.Unknown,
  message: Schema.String,
}) {}

export class AIExtractionService extends Context.Tag("@dogpile/AIExtractionService")<
  AIExtractionService,
  {
    readonly extractFromText: (text: string) => Effect.Effect<TextExtractionResult, ExtractionError>
    readonly extractFromPhoto: (photoUrl: string) => Effect.Effect<PhotoExtractionResult, ExtractionError>
    readonly extractFromPhotos: (
      photoUrls: readonly string[]
    ) => Effect.Effect<PhotoExtractionResult, ExtractionError>
  }
>() {}
