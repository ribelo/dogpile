import { Effect } from "effect"
import { HttpClient } from "@effect/platform"
import { parseHTML } from "linkedom"
import { createAdapter, type RawDogData } from "../adapter.js"
import { ScrapeError, ParseError } from "@dogpile/core"

const SHELTER_ID = "lpgk-legnica"
const BASE_URL = "https://lpgk.eu"
const SOURCE_URL = "https://lpgk.eu/category/psy-do-adopcji/"

const cleanImageUrl = (url: string) => url.replace(/-\d+x\d+(\.[a-z]+)$/i, "$1")

export const lpgkLegnicaAdapter = createAdapter({
  id: SHELTER_ID,
  name: "Schronisko dla Bezdomnych Zwierząt w Legnicy",
  url: BASE_URL,
  sourceUrl: SOURCE_URL,
  city: "Legnica",

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

      const firstPageHtml = yield* fetchPage(SOURCE_URL)
      const pages = [firstPageHtml]

      const { document: firstDoc } = parseHTML(firstPageHtml)
      const pageLinks = [...firstDoc.querySelectorAll('a[href*="/category/psy-do-adopcji/page/"]')]
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
          [...listDoc.querySelectorAll("article a[href]")]
            .map((a) => a.getAttribute("href"))
            .filter((href): href is string => !!href && href.startsWith("https://lpgk.eu/") && href.split("/").length >= 4),
        ),
      ]

      const dogs = yield* Effect.all(
        dogUrls.map((url) =>
          Effect.gen(function* () {
            const res = yield* client.get(url).pipe(Effect.flatMap((r) => r.text), Effect.scoped)
            const { document: dogDoc } = parseHTML(res)

            const bodyClass = dogDoc.body.getAttribute("class") ?? ""
            const postIdMatch = bodyClass.match(/postid-(\d+)/) || dogDoc.querySelector('[id^="post-"]')?.id.match(/post-(\d+)/)
            const externalId = postIdMatch ? postIdMatch[1] : url.split("/").filter(Boolean).pop()!

            const title = dogDoc.querySelector("title")?.textContent ?? ""
            const nameFromTitle = title.includes("|") ? title.split("|")[0].trim() : null
            const name = (nameFromTitle || dogDoc.querySelector("h1")?.textContent || "Unknown").trim()

            const rawDescription = [...dogDoc.querySelectorAll('div[dir="auto"]')]
              .map((div) => div.textContent?.replace(/&#8230;/g, "...").trim() ?? "")
              .filter((s) => s.length > 20)
              .join("\n")

            const photos: string[] = []
            const mainPhoto = dogDoc.querySelector(".et_pb_title_featured_container img")?.getAttribute("src")
            if (mainPhoto) photos.push(cleanImageUrl(mainPhoto))

            const galleryLinks = [...dogDoc.querySelectorAll('a[href*="/wp-content/uploads/"]')]
            for (const a of galleryLinks) {
              const href = a.getAttribute("href")
              if (href && /\.(?:jpg|jpeg|png)$/i.test(href)) {
                const photoUrl = cleanImageUrl(href)
                if (!photos.includes(photoUrl)) photos.push(photoUrl)
              }
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
          }).pipe(Effect.catchAll(() => Effect.succeed(null))),
        ),
        { concurrency: 5 },
      )

      return dogs.filter((d) => d !== null) as RawDogData[]
    }).pipe(
      Effect.mapError(
        (cause) =>
          new ParseError({
            shelterId: config.shelterId,
            cause,
            message: "Failed to parse LPGK Legnica pages",
          }),
      ),
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
