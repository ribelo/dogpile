import { Effect } from "effect"
import { HttpClient } from "@effect/platform"
import { parseHTML } from "linkedom"
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

      const { document: firstDoc } = parseHTML(firstPage)
      const pageLinks = [...firstDoc.querySelectorAll('a[href*="/gatunek-zwierzecia/psy/page/"]')]
      const maxPage = pageLinks.reduce((max, a) => {
        const href = a.getAttribute("href")
        const match = href?.match(/\/page\/(\d+)\//)
        return match ? Math.max(max, parseInt(match[1])) : max
      }, 1)

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
      const { document: listDoc } = parseHTML(html)
      const dogUrls = [
        ...new Set(
          [...listDoc.querySelectorAll('a[href*="/zwierzeta/"]')]
            .map((a) => a.getAttribute("href"))
            .filter((href): href is string => href?.startsWith(BASE_URL + "/zwierzeta/") ?? false),
        ),
      ]

      const dogs = yield* Effect.all(
        dogUrls.map((url) =>
          Effect.gen(function* () {
            const res = yield* client.get(url).pipe(Effect.flatMap(r => r.text), Effect.scoped)
            const { document: dogDoc } = parseHTML(res)

            const slugMatch = url.match(/\/zwierzeta\/([^"\/]+)\//)
            const externalId = slugMatch ? slugMatch[1] : url.split("/").filter(Boolean).pop()!

            const name = (
              dogDoc.querySelector("h1.bde-heading-979-185")?.textContent ??
              dogDoc.querySelector("h1")?.textContent ??
              "Unknown"
            ).trim()

            const rawDescription = [...dogDoc.querySelectorAll("p")]
              .map((p) => p.textContent?.trim() ?? "")
              .filter(
                (s) =>
                  s.length > 20 &&
                  !s.toLowerCase().includes("ciastecz") &&
                  !s.toLowerCase().includes("cookie"),
              )
              .join("\n")

            const photos = [
              ...new Set(
                [...dogDoc.querySelectorAll("img.breakdance-image-object")]
                  .map((img) => img.getAttribute("src"))
                  .filter((src): src is string => 
                    !!src && 
                    src.includes("wp-content/uploads") &&
                    !src.includes("logo") &&
                    !src.includes("miasto_spotkan") &&
                    !src.endsWith(".svg") &&
                    !src.includes("schronisko_wroclaw")
                  ),
              ),
            ]

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
