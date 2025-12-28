import { Schema } from "effect"
import { BREEDS } from "./breed.js"

export const Breed = Schema.Literal(...BREEDS)
export type Breed = typeof Breed.Type

export const BreedEstimate = Schema.Struct({
  breed: Breed,
  confidence: Schema.Number.pipe(
    Schema.greaterThanOrEqualTo(0),
    Schema.lessThanOrEqualTo(1)
  ),
})
export type BreedEstimate = typeof BreedEstimate.Type

export const SizeValue = Schema.Literal("small", "medium", "large")
export type SizeValue = typeof SizeValue.Type

export const SizeEstimate = Schema.Struct({
  value: SizeValue,
  confidence: Schema.Number.pipe(
    Schema.greaterThanOrEqualTo(0),
    Schema.lessThanOrEqualTo(1)
  ),
})
export type SizeEstimate = typeof SizeEstimate.Type

export const AgeEstimate = Schema.Struct({
  months: Schema.Number,
  confidence: Schema.Number.pipe(
    Schema.greaterThanOrEqualTo(0),
    Schema.lessThanOrEqualTo(1)
  ),
  rangeMin: Schema.Number,
  rangeMax: Schema.Number,
})
export type AgeEstimate = typeof AgeEstimate.Type

export const WeightEstimate = Schema.Struct({
  kg: Schema.Number,
  confidence: Schema.Number.pipe(
    Schema.greaterThanOrEqualTo(0),
    Schema.lessThanOrEqualTo(1)
  ),
  rangeMin: Schema.Number,
  rangeMax: Schema.Number,
})
export type WeightEstimate = typeof WeightEstimate.Type

// Fur characteristics
export const FurLength = Schema.Literal("short", "medium", "long")
export type FurLength = typeof FurLength.Type

export const FurType = Schema.Literal("smooth", "wire", "curly", "double")
export type FurType = typeof FurType.Type

export const ColorPattern = Schema.Literal(
  "solid",
  "spotted",
  "brindle",
  "merle",
  "bicolor",
  "tricolor",
  "sable",
  "tuxedo"
)
export type ColorPattern = typeof ColorPattern.Type

export const EarType = Schema.Literal("floppy", "erect", "semi")
export type EarType = typeof EarType.Type

export const TailType = Schema.Literal("long", "short", "docked", "curled")
export type TailType = typeof TailType.Type
