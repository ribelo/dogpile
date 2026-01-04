import { Context, Effect, Layer } from "effect"
import { OpenRouterClient } from "./openrouter/client.js"
import { aiConfig } from "../config/ai.js"
import type { ChatMessage, ChatCompletionsResult } from "./openrouter/types.js"
import professionalPromptTemplate from "../../prompts/image-professional.json"
import funNosePromptTemplate from "../../prompts/image-fun-nose.json"
import { OpenRouterError, RateLimitError, NetworkError } from "./openrouter/errors.js"

export interface GeneratedPhoto {
  readonly base64Url: string
}

export interface ImageGeneratorOutput {
  readonly professional: GeneratedPhoto | null
  readonly funNose: GeneratedPhoto | null
}

export interface GeneratePhotosInput {
  readonly dogDescription: string
  readonly referencePhotoUrl?: string
}

export interface ImageGenerator {
  readonly generatePhotos: (
    input: GeneratePhotosInput
  ) => Effect.Effect<ImageGeneratorOutput | null, OpenRouterError | RateLimitError | NetworkError>
}

export const ImageGenerator = Context.GenericTag<ImageGenerator>(
  "@dogpile/ImageGenerator"
)

const buildPrompt = (template: typeof professionalPromptTemplate, dogDescription: string): string => {
  const prompt = JSON.parse(JSON.stringify(template))
  prompt.subject.dog_description = dogDescription
  return JSON.stringify(prompt)
}

export const ImageGeneratorLive = Layer.effect(
  ImageGenerator,
  Effect.gen(function* () {
    const client = yield* OpenRouterClient
    const config = yield* aiConfig

    return {
      generatePhotos: (input: GeneratePhotosInput) =>
        Effect.gen(function* () {
          const professionalPrompt = buildPrompt(professionalPromptTemplate, input.dogDescription)
          const funNosePrompt = buildPrompt(funNosePromptTemplate, input.dogDescription)

          const generateSinglePhoto = (prompt: string): Effect.Effect<GeneratedPhoto | null, OpenRouterError | RateLimitError | NetworkError> =>
            Effect.gen(function* () {
              const messageContent: ChatMessage["content"] = input.referencePhotoUrl
                ? [
                    {
                      type: "image_url" as const,
                      image_url: {
                        url: input.referencePhotoUrl,
                        detail: "high" as const,
                      },
                    },
                    {
                      type: "text" as const,
                      text: prompt,
                    },
                  ]
                : prompt

              const result: ChatCompletionsResult = yield* client.chatCompletions({
                model: config.imageGenerationModel,
                messages: [
                  {
                    role: "user",
                    content: messageContent,
                  },
                ],
                modalities: ["image", "text"],
                image_config: {
                  aspect_ratio: "4:5",
                },
              })

              if (!result.choices || result.choices.length === 0) {
                return null
              }

              const image = result.choices[0]?.message?.images?.[0]?.image_url?.url
              if (!image) {
                return null
              }

              return { base64Url: image }
            })

          const [professional, funNose] = yield* Effect.all([
            generateSinglePhoto(professionalPrompt),
            generateSinglePhoto(funNosePrompt),
          ], { concurrency: 2 })

          if (!professional && !funNose) {
            return null
          }

          return { professional, funNose }
        }),
    }
  })
)
