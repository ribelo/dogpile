import { describe, expect, it, mock } from 'bun:test'
import { ConfigProvider, Effect, Layer } from 'effect'
import { ImageGenerator } from '../src/services/image-generator'
import { OpenRouterClient } from '../src/services/openrouter/client'
import type { ChatCompletionsRequest, ChatCompletionsResult } from '../src/services/openrouter/types'

const makeConfigProvider = () =>
  ConfigProvider.fromMap(new Map([
    ['OPENROUTER_API_KEY', 'test'],
    ['MODEL_IMAGE_GEN', 'test-model'],
  ]))

const makeResult = (imageUrl: string): ChatCompletionsResult => ({
  id: 'id',
  model: 'test-model',
  choices: [
    {
      index: 0,
      finish_reason: null,
      message: {
        role: 'assistant',
        content: null,
        images: [
          {
            type: 'image_url',
            image_url: { url: imageUrl },
          },
        ],
      },
    },
  ],
})

const getPromptText = (request: ChatCompletionsRequest): string => {
  const content = request.messages[0]?.content
  if (!content) {
    throw new Error('Missing message content')
  }
  if (typeof content === 'string') {
    return content
  }
  const text = content.find((part) => part.type === 'text')
  if (!text || text.type !== 'text') {
    throw new Error('Missing text content')
  }
  return text.text
}

describe('ImageGenerator.generatePhoto', () => {
  it('generates professional variant with one OpenRouter call', async () => {
    const chatCompletions = mock((request: ChatCompletionsRequest) =>
      Effect.succeed(makeResult('data:image/png;base64,abc'))
    )

    const OpenRouterClientLive = Layer.succeed(
      OpenRouterClient,
      OpenRouterClient.of({
        responses: () => Effect.dieMessage('not implemented'),
        embeddings: () => Effect.dieMessage('not implemented'),
        chatCompletions,
      })
    )

    const program = Effect.gen(function* () {
      const imageGen = yield* ImageGenerator
      return yield* imageGen.generatePhoto({
        variant: 'professional',
        dogDescription: 'A friendly golden retriever',
      })
    }).pipe(
      Effect.provide(ImageGenerator.Live.pipe(Layer.provide(OpenRouterClientLive))),
      Effect.withConfigProvider(makeConfigProvider())
    )

    const result = await Effect.runPromise(program)
    expect(result).toEqual({ base64Url: 'data:image/png;base64,abc' })
    expect(chatCompletions).toHaveBeenCalledTimes(1)

    const request = chatCompletions.mock.calls[0]?.[0]
    expect(request?.model).toBe('test-model')

    const prompt = JSON.parse(getPromptText(request))
    expect(prompt.meta.task).toBe('Professional Dog Portrait')
    expect(prompt.subject.dog_description).toBe('A friendly golden retriever')
  })

  it('generates nose variant with reference photo and one OpenRouter call', async () => {
    const chatCompletions = mock((request: ChatCompletionsRequest) =>
      Effect.succeed(makeResult('data:image/png;base64,xyz'))
    )

    const OpenRouterClientLive = Layer.succeed(
      OpenRouterClient,
      OpenRouterClient.of({
        responses: () => Effect.dieMessage('not implemented'),
        embeddings: () => Effect.dieMessage('not implemented'),
        chatCompletions,
      })
    )

    const referencePhotoUrl = 'https://example.com/dog.jpg'

    const program = Effect.gen(function* () {
      const imageGen = yield* ImageGenerator
      return yield* imageGen.generatePhoto({
        variant: 'nose',
        dogDescription: 'A small black dog',
        referencePhotoUrl,
      })
    }).pipe(
      Effect.provide(ImageGenerator.Live.pipe(Layer.provide(OpenRouterClientLive))),
      Effect.withConfigProvider(makeConfigProvider())
    )

    const result = await Effect.runPromise(program)
    expect(result).toEqual({ base64Url: 'data:image/png;base64,xyz' })
    expect(chatCompletions).toHaveBeenCalledTimes(1)

    const request = chatCompletions.mock.calls[0]?.[0]
    expect(request?.model).toBe('test-model')

    const content = request.messages[0]?.content
    expect(Array.isArray(content)).toBe(true)
    if (!Array.isArray(content)) {
      throw new Error('Expected array content')
    }

    expect(content[0]?.type).toBe('image_url')
    if (content[0]?.type === 'image_url') {
      expect(content[0].image_url.url).toBe(referencePhotoUrl)
    }

    const prompt = JSON.parse(getPromptText(request))
    expect(prompt.meta.task).toBe('Quirky Wide-Angle Dog Portrait')
    expect(prompt.subject.dog_description).toBe('A small black dog')
  })
})
