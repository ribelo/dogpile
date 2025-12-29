import { Effect, Layer, Exit, Cause, Schema } from "effect"
import { FetchHttpClient } from "@effect/platform"
import {
  OpenRouterClientLive,
  OpenRouterClient,
} from "@dogpile/core/services"
import { TextExtractionSchema } from "@dogpile/core/schemas/text-extraction.js"
import { toJsonSchema } from "@dogpile/core/schemas/json-schema.js"
import { BREEDS } from "@dogpile/core/domain/breed.js"
import promptTemplate from "@dogpile/core/prompts/text-extraction.md" with { type: "text" }

const testText = `Teo ma 10 lat, jest wykastrowany i zaszczepiony. Dobry z psami i dziećmi.`

const program = Effect.gen(function* () {
  const client = yield* OpenRouterClient
  
  const prompt = promptTemplate
    .replace("{{RAW_DESCRIPTION}}", testText)
    .replace("{{BREED_LIST}}", BREEDS.join(", "))
  
  console.log("Calling API...")
  const response = yield* client.responses({
    model: "x-ai/grok-4.1-fast",
    input: prompt,
    instructions: "Extract structured data from the adoption listing",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "text_extraction",
        strict: true,
        schema: toJsonSchema(TextExtractionSchema),
      },
    },
    reasoning: { effort: "medium" },
  })
  
  const messageOutput = response.output.find((o) => o.type === "message")
  const textContent = (messageOutput as any)?.content[0]?.text
  
  console.log("\nRaw AI response:")
  console.log(textContent)
  
  console.log("\nParsing JSON...")
  const json = JSON.parse(textContent)
  console.log(JSON.stringify(json, null, 2))
  
  console.log("\nValidating against schema...")
  const decoded = yield* Schema.decodeUnknown(TextExtractionSchema)(json).pipe(
    Effect.mapError((e) => {
      console.log("Validation error details:", JSON.stringify(e, null, 2))
      return new Error("Validation failed")
    })
  )
  console.log("Success:", decoded)
})

const layer = Layer.merge(FetchHttpClient.layer, OpenRouterClientLive)

Effect.runPromiseExit(Effect.provide(program, layer)).then((exit) => {
  if (Exit.isFailure(exit)) {
    console.error("Failed:", Cause.pretty(exit.cause))
  }
})
