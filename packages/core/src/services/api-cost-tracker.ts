import { Context, Effect, Layer, Option } from "effect"
import { calculateOpenRouterCostUsd } from "./openrouter/pricing.js"

export interface ApiCostEntry {
  readonly createdAt: Date
  readonly operation: string
  readonly model: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly costUsd: number
}

export class ApiCostTracker extends Context.Tag("@dogpile/ApiCostTracker")<
  ApiCostTracker,
  {
    readonly log: (entry: ApiCostEntry) => Effect.Effect<void, never>
  }
>() {
  static readonly Noop = Layer.succeed(
    this,
    this.of({
      log: () => Effect.void,
    })
  )
}

export const logOpenRouterUsage = (args: {
  readonly operation: string
  readonly model: string
  readonly inputTokens: number
  readonly outputTokens: number
}): Effect.Effect<void> =>
  Effect.serviceOption(ApiCostTracker).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.void,
        onSome: (tracker) =>
          tracker.log({
            createdAt: new Date(),
            operation: args.operation,
            model: args.model,
            inputTokens: args.inputTokens,
            outputTokens: args.outputTokens,
            costUsd: calculateOpenRouterCostUsd(
              args.model,
              args.inputTokens,
              args.outputTokens
            ),
          }),
      })
    )
  )
