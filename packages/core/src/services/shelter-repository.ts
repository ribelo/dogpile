import { Context, Effect, Layer } from "effect"
import type { Shelter, SyncLog } from "../domain/shelter.js"
import { NotFoundError, StorageError } from "../domain/errors.js"

export class ShelterRepository extends Context.Tag("@dogpile/ShelterRepository")<
  ShelterRepository,
  {
    readonly findById: (id: string) => Effect.Effect<Shelter, NotFoundError | StorageError>
    readonly findBySlug: (slug: string) => Effect.Effect<Shelter, NotFoundError | StorageError>
    readonly findAll: () => Effect.Effect<readonly Shelter[], StorageError>
    readonly findActive: () => Effect.Effect<readonly Shelter[], StorageError>
    readonly findDueForSync: (olderThanMinutes: number) => Effect.Effect<readonly Shelter[], StorageError>
    readonly updateLastSync: (id: string) => Effect.Effect<void, StorageError>
    readonly updateStatus: (id: string, status: Shelter["status"]) => Effect.Effect<void, StorageError>
    readonly createSyncLog: (log: Omit<SyncLog, "id">) => Effect.Effect<SyncLog, StorageError>
  }
>() {
  static readonly make = (impl: Context.Tag.Service<ShelterRepository>) => Layer.succeed(this, impl)
}
