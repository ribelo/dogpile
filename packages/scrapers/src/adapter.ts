import { Effect } from "effect"
import type { CreateDog } from "@dogpile/core"
import type { HttpClient } from "@effect/platform"
import { ScrapeError, ParseError } from "@dogpile/core"

export interface ScraperConfig {
  readonly shelterId: string
  readonly baseUrl: string
  readonly options?: Record<string, unknown>
}

export interface RawDogData {
  readonly externalId: string
  readonly name: string
  readonly breed?: string | null
  readonly ageMonths?: number | null
  readonly size?: "small" | "medium" | "large" | null
  readonly sex?: "male" | "female" | "unknown"
  readonly description?: string | null
  readonly personalityTags?: string[]
  readonly photos?: string[]
  readonly urgent?: boolean
}

export interface ShelterAdapter {
  readonly id: string
  readonly name: string
  readonly fetch: (config: ScraperConfig) => Effect.Effect<string, ScrapeError, HttpClient.HttpClient>
  readonly parse: (html: string, config: ScraperConfig) => Effect.Effect<readonly RawDogData[], ParseError>
  readonly transform: (raw: RawDogData, config: ScraperConfig) => Effect.Effect<CreateDog, ParseError>
}

export const createAdapter = (adapter: ShelterAdapter): ShelterAdapter => adapter
