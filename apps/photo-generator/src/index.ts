import { Effect } from "effect"
import { handlePhotosGenerateJob, type Env } from "./handler.js"

export default {
  async queue(
    batch: MessageBatch<unknown>,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const program = Effect.gen(function* () {
      for (const message of batch.messages) {
        const decision = yield* handlePhotosGenerateJob(message.body, env)
        if (decision === "retry") {
          message.retry()
          continue
        }
        message.ack()
      }
    })

    ctx.waitUntil(Effect.runPromise(program))
  },
}
