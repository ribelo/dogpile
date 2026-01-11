import { Effect } from "effect"
import type { CreateDogInput } from "@dogpile/core"
import type { HttpClient } from "@effect/platform"
import { ScrapeError, ParseError } from "@dogpile/core"

export interface ScraperConfig {
  readonly shelterId: string
  readonly baseUrl: string
  readonly options?: Record<string, unknown>
}

export interface RawDogData {
  readonly fingerprint: string
  readonly rawDescription: string
  readonly externalId: string
  readonly name: string
  readonly breed?: string | null
  readonly ageMonths?: number | null
  readonly size?: "small" | "medium" | "large" | null
  readonly sex?: "male" | "female" | "unknown"
  readonly personalityTags?: string[]
  readonly photos?: string[]
  readonly urgent?: boolean
  readonly sourceUrl?: string
}

export interface ShelterAdapter {
  readonly id: string
  readonly name: string
  readonly url: string
  readonly sourceUrl: string
  readonly city: string
  readonly region?: string
  readonly fetch: (config: ScraperConfig) => Effect.Effect<string, ScrapeError, HttpClient.HttpClient>
  readonly parse: (html: string, config: ScraperConfig) => Effect.Effect<readonly RawDogData[], ParseError, HttpClient.HttpClient>
  readonly transform: (raw: RawDogData, config: ScraperConfig) => Effect.Effect<CreateDogInput, ParseError>
}

export const createAdapter = (adapter: ShelterAdapter): ShelterAdapter => adapter
