import { Context, Effect, Layer } from "effect"
import { Schema } from "effect"
import { OpenRouterClient } from "./openrouter/client.js"
import { aiConfig } from "../config/ai.js"
import { TextExtractionSchema, type TextExtraction } from "../schemas/text-extraction.js"
import { toJsonSchema } from "../schemas/json-schema.js"
import { BREEDS } from "../domain/breed.js"
import { ExtractionError } from "./ai-extraction.js"
import { logOpenRouterUsage } from "./api-cost-tracker.js"
import promptTemplate from "../../prompts/text-extraction.md"
import type { ChatMessage } from "./openrouter/types.js"

export class TextExtractor extends Context.Tag("@dogpile/TextExtractor")<
  TextExtractor,
  {
    readonly extract: (
      rawDescription: string,
      shelterContext?: { name: string; city: string }
    ) => Effect.Effect<TextExtraction, ExtractionError>
  }
>() {
  static readonly Live = Layer.effect(
    this,
    Effect.gen(function* () {
      const client = yield* OpenRouterClient
      const config = yield* aiConfig

      return {
        extract: Effect.fn("TextExtractor.extract")(function* (
          rawDescription: string,
          shelterContext?: { name: string; city: string }
        ) {
            const prompt = promptTemplate
              .replaceAll("{{RAW_DESCRIPTION}}", () => rawDescription)
              .replaceAll("{{BREED_LIST}}", () => BREEDS.join(", "))
              .replaceAll("{{SHELTER_NAME}}", () => shelterContext?.name ?? "nieznane")
              .replaceAll("{{SHELTER_CITY}}", () => shelterContext?.city ?? "nieznane")

            const messages: ChatMessage[] = [
              {
                role: "system",
                content: "Extract structured data from the adoption listing. Return valid JSON only.",
              },
              { role: "user", content: prompt },
            ]

            const response = yield* client
              .chatCompletions({
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
              })
              .pipe(
                Effect.mapError((e) => new ExtractionError({ source: "text", cause: e, message: String(e) }))
              )

            yield* logOpenRouterUsage({
              operation: "text_extraction",
              model: config.textExtractionModel,
              inputTokens: response.usage?.prompt_tokens ?? 0,
              outputTokens: response.usage?.completion_tokens ?? 0,
            })

            const textContent = response.choices[0]?.message?.content
            if (!textContent) {
              return yield* Effect.fail(
                new ExtractionError({ source: "text", cause: null, message: "No text in response" })
              )
            }

            const stripMarkdown = (s: string): string =>
              s.replace(/^\s*```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim()

            const json = yield* Effect.try({
              try: () => JSON.parse(stripMarkdown(textContent)),
              catch: (e) =>
                new ExtractionError({ source: "text", cause: e, message: "Failed to parse JSON response" }),
            })

            return yield* Schema.decodeUnknown(TextExtractionSchema)(json).pipe(
              Effect.mapError((e) =>
                new ExtractionError({ source: "text", cause: e, message: "Validation failed" })
              )
            )
          }),
      }
    })
  )
}
