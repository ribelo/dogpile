import { Context, Effect, Layer, Schema } from "effect"
import { OpenRouterClient } from "./openrouter/client.js"
import { aiConfig } from "../config/ai.js"
import { DogBioSchema, type DogBio } from "../schemas/dog-bio.js"
import { toJsonSchema } from "../schemas/json-schema.js"
import promptTemplate from "../../prompts/description-gen.md" with { type: "text" }
import type { ChatMessage } from "./openrouter/types.js"

export class GenerationError extends Schema.TaggedError<GenerationError>()(
  "GenerationError",
  {
    cause: Schema.Unknown,
    message: Schema.String,
  }
) {}

export interface DogData {
  readonly name: string
  readonly sex: string | null
  readonly breedEstimates: readonly { breed: string; confidence: number }[]
  readonly ageMonths: number | null
  readonly size: string | null
  readonly personalityTags: readonly string[]
  readonly goodWithKids: boolean | null
  readonly goodWithDogs: boolean | null
  readonly goodWithCats: boolean | null
  readonly healthInfo: { vaccinated: boolean | null; sterilized: boolean | null }
}

export class DescriptionGenerator extends Context.Tag("@dogpile/DescriptionGenerator")<
  DescriptionGenerator,
  {
    readonly generate: (dogData: DogData) => Effect.Effect<DogBio, GenerationError>
  }
>() {
  static readonly Live = Layer.effect(
    this,
    Effect.gen(function* () {
      const client = yield* OpenRouterClient
      const config = yield* aiConfig

      return {
        generate: Effect.fn("DescriptionGenerator.generate")(function* (dogData: DogData) {
            const prompt = promptTemplate.replace("{{DOG_DATA}}", JSON.stringify(dogData, null, 2))

            const messages: ChatMessage[] = [
              {
                role: "system",
                content: "Generate a warm, engaging dog bio in Polish. Return valid JSON only.",
              },
              { role: "user", content: prompt },
            ]

            const response = yield* client
              .chatCompletions({
                model: config.descriptionGenModel,
                messages,
                response_format: {
                  type: "json_schema",
                  json_schema: {
                    name: "dog_bio",
                    strict: true,
                    schema: toJsonSchema(DogBioSchema),
                  },
                },
              })
              .pipe(
                Effect.mapError((e) => new GenerationError({ cause: e, message: String(e) }))
              )

            const textContent = response.choices[0]?.message?.content
            if (!textContent) {
              return yield* Effect.fail(
                new GenerationError({ cause: null, message: "No text in response" })
              )
            }

            const stripMarkdown = (s: string): string =>
              s.replace(/^\s*```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim()

            const json = yield* Effect.try({
              try: () => JSON.parse(stripMarkdown(textContent)),
              catch: (e) =>
                new GenerationError({ cause: e, message: "Failed to parse JSON response" }),
            })

            return yield* Schema.decodeUnknown(DogBioSchema)(json).pipe(
              Effect.mapError((e) =>
                new GenerationError({ cause: e, message: "Validation failed" })
              )
            )
          }),
      }
    })
  )
}
