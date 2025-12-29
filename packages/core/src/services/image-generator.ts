import { Context, Effect, Layer } from "effect"
import { OpenRouterClient } from "./openrouter/client.js"
import { aiConfig } from "../config/ai.js"

export interface ImageGeneratorOutput {
  readonly base64Url: string
}

export interface ImageGenerator {
  readonly generateNosePhoto: (
    dogDescription: string
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
      generateNosePhoto: (dogDescription: string) =>
        Effect.gen(function* () {
          const prompt = `Generate a cute, funny fisheye lens close-up photo of this dog's nose. The dog: ${dogDescription}. Style: Close-up macro shot of the nose taking up most of the frame, with the face slightly distorted in fisheye style. High quality, studio lighting, white/neutral background.`

          const result = yield* client.chatCompletions({
            model: config.imageGenerationModel,
            messages: [
              {
                role: "user",
                content: prompt,
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
