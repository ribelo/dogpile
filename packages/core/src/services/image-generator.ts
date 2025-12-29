import { Context, Effect, Layer } from "effect"
import { OpenRouterClient } from "./openrouter/client.js"
import { aiConfig } from "../config/ai.js"
import type { ChatMessage } from "./openrouter/types.js"

export interface ImageGeneratorOutput {
  readonly base64Url: string
}

export interface GenerateNosePhotoInput {
  readonly dogDescription: string
  readonly referencePhotoUrl?: string
}

export interface ImageGenerator {
  readonly generateNosePhoto: (
    input: GenerateNosePhotoInput
  ) => Effect.Effect<ImageGeneratorOutput | null, Error>
}

export const ImageGenerator = Context.GenericTag<ImageGenerator>(
  "@dogpile/ImageGenerator"
)

export const ImageGeneratorLive = Layer.effect(
  ImageGenerator,
  Effect.gen(function* () {
    const client = yield* OpenRouterClient
    const config = yield* aiConfig

    return {
      generateNosePhoto: (input: GenerateNosePhotoInput) =>
        Effect.gen(function* () {
          const textPrompt = `Generate a cute, funny fisheye lens close-up photo of this dog's nose based on the reference photo. The dog: ${input.dogDescription}. Style: Close-up macro shot of the nose taking up most of the frame, with the face slightly distorted in fisheye style. High quality, studio lighting, white/neutral background.`

          // Build message content - include reference image if provided
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
                  text: textPrompt,
                },
              ]
            : textPrompt

          const result = yield* client.chatCompletions({
            model: config.imageGenerationModel,
            messages: [
              {
                role: "user",
                content: messageContent,
              },
            ],
            modalities: ["image", "text"],
          })

          const image = result.choices[0]?.message?.images?.[0]?.image_url?.url
          if (!image) {
            return null
          }

          return { base64Url: image }
        }).pipe(
          Effect.catchAll((e) =>
            Effect.fail(
              new Error(`Image generation failed: ${e instanceof Error ? e.message : String(e)}`)
            )
          )
        ),
    }
  })
)
