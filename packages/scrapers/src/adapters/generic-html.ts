import { Effect } from "effect"
import { HttpClient } from "@effect/platform"
import { parseHTML } from "linkedom"
import { createAdapter, type RawDogData, type ScraperConfig } from "../adapter.js"
import { ScrapeError, ParseError, type CreateDogInput } from "@dogpile/core"

export const genericHtmlAdapter = createAdapter({
  id: "generic-html",
  name: "Generic HTML Scraper",
  url: "",
  sourceUrl: "",
  city: "",

  fetch: (config: ScraperConfig) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const response = yield* client.get(config.baseUrl).pipe(Effect.scoped)
      const text = yield* response.text
      return text
    }).pipe(
      Effect.mapError((cause) => new ScrapeError({
        shelterId: config.shelterId,
        cause,
        message: `Failed to fetch ${config.baseUrl}`,
      }))
    ),

  parse: (html: string, config: ScraperConfig) =>
    Effect.try({
      try: () => {
        const { document } = parseHTML(html)
        const dogs: RawDogData[] = []
        return dogs as readonly RawDogData[]
      },
      catch: (cause) => new ParseError({
        shelterId: config.shelterId,
        cause,
        message: "Failed to parse HTML",
      }),
    }),

  transform: (raw: RawDogData, config: ScraperConfig) =>
    Effect.succeed({
      shelterId: config.shelterId,
      externalId: raw.externalId,
      fingerprint: raw.fingerprint,
      rawDescription: raw.rawDescription,
      name: raw.name,
      sex: raw.sex ?? "unknown",
      personalityTags: raw.personalityTags ?? [],
      photos: raw.photos ?? [],
      urgent: raw.urgent ?? false,
    } satisfies CreateDogInput),
})
