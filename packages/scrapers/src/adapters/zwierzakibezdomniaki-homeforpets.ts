import { Effect } from "effect"
import { HttpClient } from "@effect/platform"
import { parseHTML } from "linkedom"
import { createAdapter } from "../adapter.js"
import { ScrapeError, ParseError } from "@dogpile/core"

const SHELTER_ID = "zwierzakibezdomniaki-homeforpets"
const BASE_URL = "https://zwierzakibezdomniaki-homeforpets.com"
const SOURCE_URL = `${BASE_URL}/`

export const isZwierzakiBezdomniakiHomeForPetsCanvaSite = (html: string): boolean => {
  const { document } = parseHTML(html)
  const scripts = [...document.querySelectorAll("script")].slice(0, 50)

  return scripts.some((script) => {
    const text = script.textContent ?? ""
    return (
      text.includes("window['bootstrap'] = JSON.parse(") ||
      text.includes('window["bootstrap"] = JSON.parse(') ||
      text.includes("__canva_website_bootstrap__")
    )
  })
}

export const zwierzakibezdomniakiHomeforPetsAdapter = createAdapter({
  id: SHELTER_ID,
  name: "Stowarzyszenie Zwierzaki Bezdomniaki",
  url: BASE_URL,
  sourceUrl: SOURCE_URL,
  city: "Czarny Bór",

  fetch: (config) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const response = yield* client.get(SOURCE_URL).pipe(Effect.scoped)
      return yield* response.text
    }).pipe(
      Effect.mapError((cause) =>
        new ScrapeError({
          shelterId: config.shelterId,
          cause,
          message: `Failed to fetch ${SOURCE_URL}`,
        })
      )
    ),

  parse: (html, config) => {
    if (!isZwierzakiBezdomniakiHomeForPetsCanvaSite(html)) {
      return Effect.fail(
        new ParseError({
          shelterId: config.shelterId,
          cause: new Error("Unexpected HTML: missing Canva bootstrap"),
          message: "Failed to parse site",
        })
      )
    }

    return Effect.fail(
      new ParseError({
        shelterId: config.shelterId,
        cause: new Error("Canva SPA requires client-side rendering"),
        message:
          "Blocked: site is a Canva SPA and does not expose server-rendered, per-dog detail pages to scrape",
      })
    )
  },

  transform: (raw, config) =>
    Effect.succeed({
      shelterId: config.shelterId,
      externalId: raw.externalId,
      fingerprint: raw.fingerprint,
      name: raw.name,
      sex: raw.sex ?? "unknown",
      rawDescription: raw.rawDescription,
      sourceUrl: raw.sourceUrl ?? null,
      photos: raw.photos ?? [],
    }),
})
