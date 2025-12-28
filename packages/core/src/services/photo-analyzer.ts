import { Context, Effect, Layer, Schema } from "effect"
import { OpenRouterClient } from "./openrouter/client.js"
import { aiConfig } from "../config/ai.js"
import { PhotoExtractionSchema, type PhotoExtraction } from "../schemas/photo-extraction.js"
import { toJsonSchema } from "../schemas/json-schema.js"
import { BREEDS } from "../domain/breed.js"
import { ExtractionError } from "./ai-extraction.js"
import promptTemplate from "../../prompts/photo-analysis.md" with { type: "text" }

export interface PhotoAnalyzer {
  readonly analyze: (photoUrl: string) => Effect.Effect<PhotoExtraction, ExtractionError>
  readonly analyzeMultiple: (photoUrls: readonly string[]) => Effect.Effect<PhotoExtraction, ExtractionError>
}

export const PhotoAnalyzer = Context.GenericTag<PhotoAnalyzer>("@dogpile/PhotoAnalyzer")

export const PhotoAnalyzerLive = Layer.effect(
  PhotoAnalyzer,
  Effect.gen(function* () {
    const client = yield* OpenRouterClient
    const config = yield* aiConfig

    const prompt = promptTemplate.replace("{{BREED_LIST}}", BREEDS.join(", "))

    const doAnalyze = (imageUrls: readonly string[]) =>
      Effect.gen(function* () {
        const imageContent = imageUrls.map((url) => ({
          type: "input_image" as const,
          image_url: url,
        }))

        const response = yield* client.responses({
          model: config.photoAnalysisModel,
          input: [
            {
              type: "message",
              role: "user",
              content: [
                { type: "input_text", text: prompt },
                ...imageContent,
              ],
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "photo_extraction",
              strict: true,
              schema: toJsonSchema(PhotoExtractionSchema),
            },
          },
          reasoning: { effort: "medium" },
        }).pipe(
          Effect.mapError((e) => new ExtractionError("photo", e, String(e)))
        )

        const textContent = response.output[0]?.content[0]?.text
        if (!textContent) {
          return yield* Effect.fail(new ExtractionError("photo", null, "No text in response"))
        }

        const json = yield* Effect.try({
          try: () => JSON.parse(textContent),
          catch: (e) => new ExtractionError("photo", e, "Failed to parse JSON response"),
        })

        return yield* Schema.decodeUnknown(PhotoExtractionSchema)(json).pipe(
          Effect.mapError((e) => new ExtractionError("photo", e, "Validation failed"))
        )
      })

    return {
      analyze: (photoUrl) => doAnalyze([photoUrl]),
      analyzeMultiple: (photoUrls) => doAnalyze(photoUrls),
    }
  })
)
