import { Effect } from "effect"
import { HttpClient } from "@effect/platform"
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

      const firstPage = yield* fetchPage(SOURCE_URL)
      const pages = [firstPage]
      
      const pageLinks = [...firstPage.matchAll(/href="(https:\/\/lpgk\.eu\/category\/psy-do-adopcji\/page\/(\d+)\/)"/g)]
      const maxPage = Math.max(...pageLinks.map(m => parseInt(m[2])), 1)

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
      const dogUrls = [...new Set([...html.matchAll(/<article[^>]*>[\s\S]*?<a[^>]+href="(https:\/\/lpgk\.eu\/[^"\/]+\/)"/g)].map(m => m[1]))]
      
      const dogs = yield* Effect.all(
        dogUrls.map((url) =>
          Effect.gen(function* () {
            const res = yield* client.get(url).pipe(Effect.flatMap(r => r.text), Effect.scoped)
            
            const postIdMatch = res.match(/postid-(\d+)/) || res.match(/id="post-(\d+)"/)
            const externalId = postIdMatch ? postIdMatch[1] : url.split("/").filter(Boolean).pop()!
            
            const nameMatch = res.match(/<title>([^|]+)\| LPGK<\/title>/) || res.match(/<h1[^>]*>([^<]+)<\/h1>/)
            const name = (nameMatch ? nameMatch[1] : "Unknown").trim()

            const descriptionMatches = [...res.matchAll(/<div dir="auto"[^>]*>([^<]+(?:<[^>]+>[^<]*)*)<\/div>/g)]
            const rawDescription = descriptionMatches
              .map(m => m[1].replace(/<[^>]*>/g, "").replace(/&#8230;/g, "...").trim())
              .filter(s => s.length > 20)
              .join("\n")

            const photos: string[] = []
            const mainPhotoMatch = res.match(/<div class="et_pb_title_featured_container">[\s\S]*?<img[^>]+src="([^"]+)"/)
            if (mainPhotoMatch) photos.push(cleanImageUrl(mainPhotoMatch[1]))

            const galleryMatches = res.matchAll(/<a[^>]+href="(https:\/\/lpgk\.eu\/wp-content\/uploads\/[^"]+\.(?:jpg|jpeg|png))"/g)
            for (const match of galleryMatches) {
              const photoUrl = cleanImageUrl(match[1])
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
        message: "Failed to parse LPGK Legnica pages",
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
      sourceUrl: raw.sourceUrl ?? SOURCE_URL,
      photos: raw.photos ?? [],
    }),
})
