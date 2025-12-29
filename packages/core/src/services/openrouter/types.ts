import { Schema } from "effect"

export const ResponsesInputTextContent = Schema.Struct({
  type: Schema.Literal("input_text"),
  text: Schema.String,
})

export const ResponsesInputImageContent = Schema.Struct({
  type: Schema.Literal("input_image"),
  image_url: Schema.String,
  detail: Schema.optional(Schema.Literal("auto", "low", "high")),
})

export const ResponsesInputContent = Schema.Union(
  ResponsesInputTextContent,
  ResponsesInputImageContent
)

export const ResponsesMessage = Schema.Struct({
  type: Schema.Literal("message"),
  role: Schema.Literal("user", "assistant", "system"),
  content: Schema.Union(
    Schema.String,
    Schema.Array(ResponsesInputContent)
  ),
})

export const JsonSchemaFormat = Schema.Struct({
  type: Schema.Literal("json_schema"),
  json_schema: Schema.Struct({
    name: Schema.String,
    strict: Schema.Boolean,
    schema: Schema.Unknown,
  }),
})

export const TextFormat = Schema.Struct({
  type: Schema.Literal("text"),
})

export const ResponseFormat = Schema.Union(JsonSchemaFormat, TextFormat)

export const ReasoningConfig = Schema.Struct({
  effort: Schema.optional(Schema.Literal("low", "medium", "high")),
})

export const ResponsesRequest = Schema.Struct({
  model: Schema.String,
  input: Schema.Union(
    Schema.String,
    Schema.Array(ResponsesMessage)
  ),
  instructions: Schema.optional(Schema.String),
  max_output_tokens: Schema.optional(Schema.Number),
  temperature: Schema.optional(Schema.Number),
  top_p: Schema.optional(Schema.Number),
  response_format: Schema.optional(ResponseFormat),
  reasoning: Schema.optional(ReasoningConfig),
})

export type ResponsesRequest = typeof ResponsesRequest.Type

export const OutputTextContent = Schema.Struct({
  type: Schema.Literal("output_text"),
  text: Schema.String,
  annotations: Schema.optional(Schema.Array(Schema.Unknown)),
})

export const ReasoningOutput = Schema.Struct({
  type: Schema.Literal("reasoning"),
  id: Schema.String,
  summary: Schema.optional(Schema.Array(Schema.Unknown)),
  encrypted_content: Schema.optional(Schema.String),
  format: Schema.optional(Schema.String),
})

export const OutputMessage = Schema.Struct({
  type: Schema.Literal("message"),
  id: Schema.String,
  role: Schema.Literal("assistant"),
  status: Schema.String,
  content: Schema.Array(OutputTextContent),
})

export const OutputItem = Schema.Union(OutputMessage, ReasoningOutput)

export const ResponsesUsage = Schema.Struct({
  input_tokens: Schema.Number,
  output_tokens: Schema.Number,
  total_tokens: Schema.optional(Schema.Number),
})

export const ResponsesResult = Schema.Struct({
  id: Schema.String,
  object: Schema.optional(Schema.String),
  status: Schema.String,
  output: Schema.Array(OutputItem),
  usage: Schema.optional(ResponsesUsage),
})

export type ResponsesResult = typeof ResponsesResult.Type

export const EmbeddingData = Schema.Struct({
  object: Schema.Literal("embedding"),
  embedding: Schema.Array(Schema.Number),
  index: Schema.Number,
})

export const EmbeddingsRequest = Schema.Struct({
  model: Schema.String,
  input: Schema.Union(Schema.String, Schema.Array(Schema.String)),
  dimensions: Schema.optional(Schema.Number),
})

export type EmbeddingsRequest = typeof EmbeddingsRequest.Type

export const EmbeddingsResult = Schema.Struct({
  object: Schema.Literal("list"),
  data: Schema.Array(EmbeddingData),
  model: Schema.String,
  usage: Schema.Struct({
    prompt_tokens: Schema.Number,
    total_tokens: Schema.Number,
  }),
})

export type EmbeddingsResult = typeof EmbeddingsResult.Type

// Chat Completions API types (for structured outputs)
export const ChatMessageContent = Schema.Union(
  Schema.String,
  Schema.Array(Schema.Union(
    Schema.Struct({
      type: Schema.Literal("text"),
      text: Schema.String,
    }),
    Schema.Struct({
      type: Schema.Literal("image_url"),
      image_url: Schema.Struct({
        url: Schema.String,
        detail: Schema.optional(Schema.Literal("auto", "low", "high")),
      }),
    })
  ))
)

export const ChatMessage = Schema.Struct({
  role: Schema.Literal("system", "user", "assistant"),
  content: ChatMessageContent,
})

export type ChatMessage = typeof ChatMessage.Type

export const ChatCompletionsRequest = Schema.Struct({
  model: Schema.String,
  messages: Schema.Array(ChatMessage),
  max_tokens: Schema.optional(Schema.Number),
  temperature: Schema.optional(Schema.Number),
  top_p: Schema.optional(Schema.Number),
  response_format: Schema.optional(ResponseFormat),
  modalities: Schema.optional(Schema.Array(Schema.Literal("text", "image"))),
})

export type ChatCompletionsRequest = typeof ChatCompletionsRequest.Type

export const ChatChoice = Schema.Struct({
  index: Schema.Number,
  message: Schema.Struct({
    role: Schema.Literal("assistant"),
    content: Schema.NullOr(Schema.String),
    images: Schema.optional(Schema.Array(Schema.Struct({
      type: Schema.Literal("image_url"),
      image_url: Schema.Struct({
        url: Schema.String,
      }),
    }))),
  }),
  finish_reason: Schema.NullOr(Schema.String),
})

export const ChatCompletionsResult = Schema.Struct({
  id: Schema.String,
  object: Schema.optional(Schema.String),
  created: Schema.optional(Schema.Number),
  model: Schema.String,
  choices: Schema.Array(ChatChoice),
  usage: Schema.optional(Schema.Struct({
    prompt_tokens: Schema.Number,
    completion_tokens: Schema.Number,
    total_tokens: Schema.Number,
  })),
})

export type ChatCompletionsResult = typeof ChatCompletionsResult.Type
