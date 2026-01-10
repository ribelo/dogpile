import { Effect } from "effect"
import { HttpClient } from "@effect/platform"
import { parseHTML } from "linkedom"
import { createAdapter, type RawDogData } from "../adapter.js"
import { ScrapeError, ParseError } from "@dogpile/core"

const SHELTER_ID = "zoodoptuj-latka-na-lapce"
const BASE_URL = "https://zoodoptuj.pl"
const SOURCE_URL = `${BASE_URL}/dom-tymczasowy-latka-na-lapce`

const MAX_DOGS = 50
const MAX_PHOTOS = 10
const MAX_DESCRIPTION_PARAGRAPHS = 80

const parseSex = (input: string): "male" | "female" | "unknown" => {
  const normalized = input.trim().toLowerCase()
  if (normalized === "on") return "male"
  if (normalized === "ona") return "female"
  return "unknown"
}

const uniq = <T>(items: readonly T[]): T[] => [...new Set(items)]

export const zoodoptujLatkaNaLapceAdapter = createAdapter({
  id: SHELTER_ID,
  name: "Dom Tymczasowy Łatka na Łapce",
  url: BASE_URL,
  sourceUrl: SOURCE_URL,
  city: "Wrocław",

  fetch: (config) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const res = yield* client.get(SOURCE_URL).pipe(Effect.scoped)
      return yield* res.text
    }).pipe(
      Effect.mapError((cause) => new ScrapeError({
        shelterId: config.shelterId,
        cause,
        message: `Failed to fetch ${SOURCE_URL}`,
      }))
    ),

  parse: (html, config) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const { document: listDoc } = parseHTML(html)

      const dogUrls = uniq(
        [...listDoc.querySelectorAll(".pet-items a[href]")]
          .map((a) => a.getAttribute("href"))
          .filter((href): href is string => !!href)
          .map((href) => new URL(href, BASE_URL))
          .filter((url) => url.origin === BASE_URL && url.pathname.startsWith("/zwierzak/pies/"))
          .map((url) => url.toString()),
      ).slice(0, MAX_DOGS)

      const dogs = yield* Effect.all(
        dogUrls.map((sourceUrl) =>
          Effect.gen(function* () {
            const res = yield* client.get(sourceUrl).pipe(Effect.flatMap((r) => r.text), Effect.scoped)
            const { document: dogDoc } = parseHTML(res)

            const url = new URL(sourceUrl)
            const slug = url.pathname.split("/").filter(Boolean).at(-1) ?? url.pathname
            const numericId = slug.split("-")[0]?.trim()
            const externalId = numericId ? numericId : slug

            const name =
              dogDoc.querySelector(".pet-intro-name h1")?.textContent?.trim() ??
              dogDoc.querySelector("h1")?.textContent?.trim() ??
              "Unknown"

            const getDetail = (label: string): string | null => {
              for (const item of [...dogDoc.querySelectorAll(".list-details li")].slice(0, 50)) {
                const key = item.querySelector("strong")?.textContent?.replace(":", "").trim()
                if (key !== label) continue
                const value = item.querySelector("span")?.textContent?.trim()
                if (value) return value
              }
              return null
            }

            const sexText = getDetail("Płeć")

            const rawDescription = [...dogDoc.querySelectorAll(".pet_desc p")]
              .map((p) => p.textContent?.trim() ?? "")
              .filter((s) => s.length > 0)
              .slice(0, MAX_DESCRIPTION_PARAGRAPHS)
              .join("\n")

            const ogImage = dogDoc.querySelector('meta[property="og:image"]')?.getAttribute("content")?.trim()
            const petAvatar = dogDoc.querySelector("img.pet_avatar")?.getAttribute("src")?.trim()

            const photos = uniq(
              [ogImage, petAvatar]
                .filter((src): src is string => !!src && src.length > 0)
                .map((src) => new URL(src, BASE_URL).toString()),
            ).slice(0, MAX_PHOTOS)

            return {
              fingerprint: `${SHELTER_ID}:${externalId}`,
              externalId,
              name,
              sex: sexText ? parseSex(sexText) : "unknown",
              rawDescription,
              photos,
              sourceUrl,
            } satisfies RawDogData
          }).pipe(Effect.catchAll(() => Effect.succeed(null)))
        ),
        { concurrency: 5 },
      )

      return dogs.filter((d) => d !== null) as RawDogData[]
    }).pipe(
      Effect.mapError((cause) => new ParseError({
        shelterId: config.shelterId,
        cause,
        message: "Failed to parse zoodoptuj profile or pet pages",
      }))
    ),

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
