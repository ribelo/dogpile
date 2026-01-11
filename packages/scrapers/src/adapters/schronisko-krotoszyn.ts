import { Effect } from "effect"
import { HttpClient } from "@effect/platform"
import { parseHTML } from "linkedom"
import { createAdapter, type RawDogData } from "../adapter.js"
import { ScrapeError, ParseError } from "@dogpile/core"

const SHELTER_ID = "schronisko-krotoszyn"
const BASE_URL = "https://www.schroniskokrotoszyn.pl"
const SOURCE_URL = `${BASE_URL}/do-adopcji/`

const MAX_DOG_URLS = 300

const isPhotoUrl = (url: string): boolean =>
  /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(url)

export const extractKrotoszynDogUrlsFromListing = (html: string): readonly string[] => {
  const { document } = parseHTML(html)
  const urls = [...document.querySelectorAll('a[href*="/do-adopcji/"]')]
    .map((a) => a.getAttribute("href"))
    .filter((href): href is string => !!href)
    .filter((href) => {
      const path = href.replace(BASE_URL, "")
      const segments = path.split("/").filter(Boolean)
      return segments.length === 2 && segments[0] === "do-adopcji"
    })
    .map((href) => (href.startsWith("http") ? href : `${BASE_URL}${href}`))

  return [...new Set(urls)].slice(0, MAX_DOG_URLS)
}

export const extractKrotoszynDogFromDetailPage = (html: string, url: string): RawDogData => {
  const { document } = parseHTML(html)

  const slug = url.split("/").filter(Boolean).pop() ?? ""
  const externalId = slug

  const nameEl = document.querySelector("h1")
  const name = nameEl?.textContent?.trim() ?? "Unknown"

  const descriptionEl = document.querySelector(".content-text, .description, article p")
  const rawDescription = descriptionEl?.textContent?.trim() ?? "No description"

  const photoUrls: string[] = []

  const galleryImages = [...document.querySelectorAll('a[href*="-full-size/"]')]
    .map((a) => a.getAttribute("href"))
    .filter((href): href is string => !!href && isPhotoUrl(href))
    .map((href) => (href.startsWith("http") ? href : `${BASE_URL}${href}`))

  photoUrls.push(...galleryImages)

  const contentImages = [...document.querySelectorAll('img[src*="-medium-w/"], img[src*="-large/"]')]
    .map((img) => img.getAttribute("src"))
    .filter((src): src is string => !!src && isPhotoUrl(src))
    .map((src) => (src.startsWith("http") ? src : `${BASE_URL}${src}`))

  photoUrls.push(...contentImages)

  const photos = [...new Set(photoUrls)]

  let sex: "male" | "female" | "unknown" = "unknown"
  const pageText = document.body?.textContent?.toLowerCase() ?? ""
  if (pageText.includes("piesek") || pageText.includes("samiec")) {
    sex = "male"
  } else if (pageText.includes("suczka") || pageText.includes("samica")) {
    sex = "female"
  }

  return {
    fingerprint: `${SHELTER_ID}:${externalId}`,
    externalId,
    name,
    rawDescription,
    photos,
    sex,
    sourceUrl: url,
  }
}

export const schroniskoKrotoszynAdapter = createAdapter({
  id: SHELTER_ID,
  name: "Schronisko dla Bezdomnych Zwierząt w Krotoszynie",
  url: BASE_URL,
  sourceUrl: SOURCE_URL,
  city: "Krotoszyn",

  fetch: (config) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient

      const html = yield* client.get(SOURCE_URL).pipe(
        Effect.flatMap((res) => res.text),
        Effect.scoped,
        Effect.mapError(
          (cause) =>
            new ScrapeError({
              shelterId: config.shelterId,
              cause,
              message: `Failed to fetch ${SOURCE_URL}`,
            }),
        ),
      )
      return html
    }),

  parse: (html, config) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const dogUrls = extractKrotoszynDogUrlsFromListing(html)

      const dogs = yield* Effect.all(
        dogUrls.map((url) =>
          Effect.gen(function* () {
            const detailHtml = yield* client.get(url).pipe(Effect.flatMap((r) => r.text), Effect.scoped)
            return extractKrotoszynDogFromDetailPage(detailHtml, url)
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
            message: "Failed to parse Schronisko Krotoszyn pages",
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
