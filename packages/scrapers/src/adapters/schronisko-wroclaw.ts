import { Effect } from "effect"
import { HttpClient } from "@effect/platform"
import { createAdapter, type RawDogData } from "../adapter.js"
import { ScrapeError, ParseError } from "@dogpile/core"

const SHELTER_ID = "schronisko-wroclaw"
const BASE_URL = "https://schroniskowroclaw.pl"
const SOURCE_URL = "https://schroniskowroclaw.pl/gatunek-zwierzecia/psy/"

export const schroniskoWroclawAdapter = createAdapter({
  id: SHELTER_ID,
  name: "Schronisko dla Bezdomnych Zwierząt we Wrocławiu",
  url: BASE_URL,
  sourceUrl: SOURCE_URL,
  city: "Wrocław",

  fetch: (config) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      
      const fetchPage = (url: string) =>
        client.get(url).pipe(
          Effect.flatMap((res) => res.text),
          Effect.scoped,
          Effect.mapError((cause) => new ScrapeError({
            shelterId: config.shelterId,
            cause,
            message: `Failed to fetch ${url}`,
          }))
        )

      const firstPage = yield* fetchPage(SOURCE_URL)
      const pages = [firstPage]
      
      const pageMatches = [...firstPage.matchAll(/\/gatunek-zwierzecia\/psy\/page\/(\d+)\//g)]
      const maxPage = pageMatches.length > 0 
        ? Math.max(...pageMatches.map(m => parseInt(m[1])))
        : 1

      if (maxPage > 1) {
        const remainingPages = yield* Effect.all(
          Array.from({ length: maxPage - 1 }, (_, i) => fetchPage(`${SOURCE_URL}page/${i + 2}/`)),
          { concurrency: 3 }
        )
        pages.push(...remainingPages)
      }

      return pages.join("\n")
    }),

  parse: (html, config) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const dogUrls = [...new Set([...html.matchAll(/href="(https:\/\/schroniskowroclaw\.pl\/zwierzeta\/([^"\/]+)\/)"/g)].map(m => m[1]))]
      
      const dogs = yield* Effect.all(
        dogUrls.map((url) =>
          Effect.gen(function* () {
            const res = yield* client.get(url).pipe(Effect.flatMap(r => r.text), Effect.scoped)
            
            const slugMatch = url.match(/\/zwierzeta\/([^"\/]+)\//)
            const externalId = slugMatch ? slugMatch[1] : url.split("/").filter(Boolean).pop()!
            
            const nameMatch = res.match(/<h1 class="[^"]*bde-heading-979-185[^"]*">([^<]+)<\/h1>/) || res.match(/<h1[^>]*>([^<]+)<\/h1>/)
            const name = (nameMatch ? nameMatch[1] : "Unknown").trim()

            const descriptionParagraphs = [...res.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
            const rawDescription = descriptionParagraphs
              .map(m => m[1].replace(/<[^>]*>/g, "").trim())
              .filter(s => s.length > 20 && !s.toLowerCase().includes("ciastecz") && !s.toLowerCase().includes("cookie"))
              .join("\n")

            const photos: string[] = []
            const galleryMatches = res.matchAll(/<a[^>]+class="ee-gallery-item"[^>]+href="([^"]+)"/g)
            for (const match of galleryMatches) {
              const photoUrl = match[1]
              if (!photos.includes(photoUrl)) photos.push(photoUrl)
            }

            return {
              fingerprint: `${SHELTER_ID}:${externalId}`,
              externalId,
              name,
              rawDescription,
              photos,
              sex: "unknown" as const,
              sourceUrl: url,
            } satisfies RawDogData
          }).pipe(
            Effect.catchAll(() => Effect.succeed(null))
          )
        ),
        { concurrency: 5 }
      )

      return dogs.filter((d) => d !== null) as RawDogData[]
    }).pipe(
      Effect.mapError((cause) => new ParseError({
        shelterId: config.shelterId,
        cause,
        message: "Failed to parse Schronisko Wrocław pages",
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
