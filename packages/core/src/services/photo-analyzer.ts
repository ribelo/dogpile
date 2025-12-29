import { Context, Effect, Layer, Schema } from "effect"
import { OpenRouterClient } from "./openrouter/client.js"
import { aiConfig } from "../config/ai.js"
import { PhotoExtractionSchema, type PhotoExtraction } from "../schemas/photo-extraction.js"
import { toJsonSchema } from "../schemas/json-schema.js"
import { BREEDS } from "../domain/breed.js"
import { ExtractionError } from "./ai-extraction.js"
import promptTemplate from "../../prompts/photo-analysis.md" with { type: "text" }
import type { ChatMessage } from "./openrouter/types.js"

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
          type: "image_url" as const,
          image_url: { url },
        }))

        const messages: ChatMessage[] = [
          { role: "system", content: "Analyze the dog photo(s) and extract structured data. Return valid JSON only." },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              ...imageContent,
            ],
          },
        ]

        const response = yield* client.chatCompletions({
          model: config.photoAnalysisModel,
          messages,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "photo_extraction",
              strict: true,
              schema: toJsonSchema(PhotoExtractionSchema),
            },
          },
        }).pipe(
          Effect.mapError((e) => new ExtractionError("photo", e, String(e)))
        )

        const textContent = response.choices[0]?.message?.content
        if (!textContent) {
          return yield* Effect.fail(new ExtractionError("photo", null, "No text in response"))
        }

  const stripMarkdown = (s: string): string =>
    s.replace(/^\s*```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim()

        const json = yield* Effect.try({
          try: () => JSON.parse(stripMarkdown(textContent)),
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
