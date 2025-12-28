import { Config, Redacted } from "effect"

export interface AIConfig {
  readonly apiKey: Redacted.Redacted
  readonly textExtractionModel: string
  readonly photoAnalysisModel: string
  readonly descriptionGenModel: string
  readonly embeddingModel: string
}

export const aiConfig = Config.all({
  apiKey: Config.redacted("OPENROUTER_API_KEY"),
  textExtractionModel: Config.string("MODEL_TEXT_EXTRACTION").pipe(
    Config.withDefault("x-ai/grok-4.1-fast")
  ),
  photoAnalysisModel: Config.string("MODEL_PHOTO_ANALYSIS").pipe(
    Config.withDefault("google/gemini-3-flash-preview")
  ),
  descriptionGenModel: Config.string("MODEL_DESCRIPTION_GEN").pipe(
    Config.withDefault("google/gemini-3-flash-preview")
  ),
  embeddingModel: Config.string("MODEL_EMBEDDING").pipe(
    Config.withDefault("google/gemini-embedding-001")
  ),
})
