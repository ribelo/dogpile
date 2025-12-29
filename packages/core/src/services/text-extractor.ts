import { Context, Effect, Layer } from "effect"
import { Schema } from "effect"
import { OpenRouterClient } from "./openrouter/client.js"
import { aiConfig } from "../config/ai.js"
import { TextExtractionSchema, type TextExtraction } from "../schemas/text-extraction.js"
import { toJsonSchema } from "../schemas/json-schema.js"
import { BREEDS } from "../domain/breed.js"
import { ExtractionError } from "./ai-extraction.js"
import promptTemplate from "../../prompts/text-extraction.md" with { type: "text" }
import type { ChatMessage } from "./openrouter/types.js"

export interface TextExtractor {
  readonly extract: (rawDescription: string) => Effect.Effect<TextExtraction, ExtractionError>
}

export const TextExtractor = Context.GenericTag<TextExtractor>("@dogpile/TextExtractor")

export const TextExtractorLive = Layer.effect(
  TextExtractor,
  Effect.gen(function* () {
    const client = yield* OpenRouterClient
    const config = yield* aiConfig

    return {
      extract: (rawDescription: string) =>
        Effect.gen(function* () {
          const prompt = promptTemplate
            .replace("{{RAW_DESCRIPTION}}", rawDescription)
            .replace("{{BREED_LIST}}", BREEDS.join(", "))

          const messages: ChatMessage[] = [
            { role: "system", content: "Extract structured data from the adoption listing. Return valid JSON only." },
            { role: "user", content: prompt },
          ]

          const response = yield* client.chatCompletions({
            model: config.textExtractionModel,
            messages,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "text_extraction",
                strict: true,
                schema: toJsonSchema(TextExtractionSchema),
              },
            },
          }).pipe(
            Effect.mapError((e) => new ExtractionError("text", e, String(e)))
          )

          const textContent = response.choices[0]?.message?.content
          if (!textContent) {
            return yield* Effect.fail(new ExtractionError("text", null, "No text in response"))
          }

  const stripMarkdown = (s: string): string =>
    s.replace(/^\s*```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim()

          const json = yield* Effect.try({
            try: () => JSON.parse(stripMarkdown(textContent)),
            catch: (e) => new ExtractionError("text", e, "Failed to parse JSON response"),
          })

          return yield* Schema.decodeUnknown(TextExtractionSchema)(json).pipe(
            Effect.mapError((e) => new ExtractionError("text", e, "Validation failed"))
          )
        }),
    }
  })
)
