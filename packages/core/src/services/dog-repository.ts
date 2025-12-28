import { Context, Effect, Layer } from "effect"
import type { Dog, CreateDog } from "../domain/dog.js"
import { NotFoundError, StorageError } from "../domain/errors.js"

export interface DogFilters {
  readonly shelterId?: string
  readonly city?: string
  readonly size?: string
  readonly sex?: string
  readonly urgent?: boolean
  readonly status?: string
  readonly limit?: number
  readonly offset?: number
}

export interface DogRepository {
  readonly findById: (id: string) => Effect.Effect<Dog, NotFoundError | StorageError>
  readonly findByExternalId: (shelterId: string, externalId: string) => Effect.Effect<Dog | null, StorageError>
  readonly findAll: (filters: DogFilters) => Effect.Effect<readonly Dog[], StorageError>
  readonly findByIds: (ids: readonly string[]) => Effect.Effect<readonly Dog[], StorageError>
  readonly create: (dog: CreateDog) => Effect.Effect<Dog, StorageError>
  readonly update: (id: string, dog: Partial<CreateDog>) => Effect.Effect<Dog, NotFoundError | StorageError>
  readonly delete: (id: string) => Effect.Effect<void, StorageError>
  readonly deleteByShelterId: (shelterId: string) => Effect.Effect<number, StorageError>
  readonly getChecksumsByShelterId: (shelterId: string) => Effect.Effect<ReadonlyMap<string, string>, StorageError>
}

export const DogRepository = Context.GenericTag<DogRepository>("@dogpile/DogRepository")

export const makeDogRepository = (
  impl: DogRepository
): Layer.Layer<DogRepository> =>
  Layer.succeed(DogRepository, impl)
