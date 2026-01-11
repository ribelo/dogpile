import { Context, Effect, Layer } from "effect"
import { OpenRouterClient } from "./openrouter/client.js"
import { aiConfig } from "../config/ai.js"
import type { ChatMessage, ChatCompletionsResult } from "./openrouter/types.js"
import { OpenRouterError, RateLimitError, NetworkError } from "./openrouter/errors.js"

interface PromptTemplate {
  readonly meta: {
    readonly task: string
    readonly style_reference: string
    readonly short_description: string
  }
  readonly subject: {
    readonly dog_description: string
    readonly positioning: {
      readonly framing: string
      readonly body_visible: string
      readonly alignment: string
      readonly eye_contact: string
    }
    readonly expression: string
    readonly focus: string
  }
  readonly photography: {
    readonly camera_gear: Record<string, string>
    readonly lighting: Record<string, string>
    readonly texture: Record<string, string>
  }
  readonly background: {
    readonly type: string
    readonly color_name: string
    readonly hex_code: string
    readonly details: string
    readonly atmosphere: string
  }
}

const professionalPromptTemplate: PromptTemplate = await import("../../prompts/image-professional.json")
const funNosePromptTemplate: PromptTemplate = await import("../../prompts/image-fun-nose.json")

export interface GeneratedPhoto {
  readonly base64Url: string
}

export interface ImageGeneratorOutput {
  readonly professional: GeneratedPhoto | null
  readonly funNose: GeneratedPhoto | null
}

export interface GeneratePhotosInput {
  readonly dogDescription: string
  readonly referencePhotoUrl?: string | undefined
}

export interface GenerateSinglePhotoInput {
  readonly variant: "professional" | "nose"
  readonly dogDescription: string
  readonly referencePhotoUrl?: string | undefined
}

export class ImageGenerator extends Context.Tag("@dogpile/ImageGenerator")<
  ImageGenerator,
  {
    readonly generatePhoto: (
      input: GenerateSinglePhotoInput
    ) => Effect.Effect<GeneratedPhoto | null, OpenRouterError | RateLimitError | NetworkError>
    readonly generatePhotos: (
      input: GeneratePhotosInput
    ) => Effect.Effect<ImageGeneratorOutput | null, OpenRouterError | RateLimitError | NetworkError>
  }
>() {
  static readonly Live = Layer.effect(
    this,
    Effect.gen(function* () {
      const client = yield* OpenRouterClient
      const config = yield* aiConfig

      const generatePhoto = Effect.fn("ImageGenerator.generatePhoto")(function* (
        input: GenerateSinglePhotoInput
      ) {
        const template = input.variant === "professional"
          ? professionalPromptTemplate
          : funNosePromptTemplate

        const prompt = buildPrompt(template, input.dogDescription)

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

      return {
        generatePhoto,
        generatePhotos: Effect.fn("ImageGenerator.generatePhotos")(function* (
          input: GeneratePhotosInput
        ) {
            const [professional, funNose] = yield* Effect.all([
              generatePhoto({
                variant: "professional",
                dogDescription: input.dogDescription,
                referencePhotoUrl: input.referencePhotoUrl,
              }),
              generatePhoto({
                variant: "nose",
                dogDescription: input.dogDescription,
                referencePhotoUrl: input.referencePhotoUrl,
              }),
            ], { concurrency: 2 })

            if (!professional && !funNose) {
              return null
            }

            return { professional, funNose }
          }),
      }
    })
  )
}

const buildPrompt = (template: PromptTemplate, dogDescription: string): string => {
  const prompt = JSON.parse(JSON.stringify(template))
  prompt.subject.dog_description = dogDescription
  return JSON.stringify(prompt)
}
