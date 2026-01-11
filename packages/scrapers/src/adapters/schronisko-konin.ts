import { Effect } from "effect"
import { HttpClient } from "@effect/platform"
import { parseHTML } from "linkedom"
import { createAdapter, type RawDogData } from "../adapter.js"
import { ScrapeError, ParseError } from "@dogpile/core"

const SHELTER_ID = "schronisko-konin"
const BASE_URL = "https://www.schroniskokonin.pl"
const SOURCE_URL = `${BASE_URL}/kacik-adopcyjny`

const MAX_DOG_URLS = 300
const MAX_PAGES = 20

const isPhotoUrl = (url: string): boolean =>
  /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(url)

export const extractKoninDogUrlsFromListing = (html: string): readonly string[] => {
  const { document } = parseHTML(html)
  const urls = [...document.querySelectorAll('a[href*="/kacik-adopcyjny/"]')]
    .map((a) => a.getAttribute("href"))
    .filter((href): href is string => !!href)
    .filter((href) => {
      const path = href.replace(BASE_URL, "")
      if (path.includes("metamorfozy")) return false
      if (path.includes("?start=")) return false
      const segments = path.split("/").filter(Boolean)
      return segments.length === 2 && segments[0] === "kacik-adopcyjny" && /^\d+-/.test(segments[1])
    })
    .map((href) => (href.startsWith("http") ? href : `${BASE_URL}${href}`))

  return [...new Set(urls)].slice(0, MAX_DOG_URLS)
}

export const extractKoninDogFromDetailPage = (html: string, url: string): RawDogData => {
  const { document } = parseHTML(html)

  const pathSegments = url.split("/").filter(Boolean)
  const slug = pathSegments.pop() ?? ""
  const idMatch = slug.match(/^(\d+)-/)
  const externalId = idMatch ? idMatch[1] : slug

  const nameEl = document.querySelector("h2, h1.page-header")
  let name = nameEl?.textContent?.trim() ?? "Unknown"
  if (name.startsWith("Psy")) {
    name = name.slice(3).trim()
  }
  const dashIndex = name.indexOf(" - ")
  if (dashIndex > 0) {
    name = name.slice(0, dashIndex).trim()
  }

  const descEl = document.querySelector(".item-page p, article p, .content p")
  const rawDescription = descEl?.textContent?.trim() ?? "No description"

  const photoUrls: string[] = []

  const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content")
  if (ogImage && isPhotoUrl(ogImage)) {
    photoUrls.push(ogImage.startsWith("http") ? ogImage : `${BASE_URL}${ogImage}`)
  }

  const contentImages = [...document.querySelectorAll('img[src*="/images/"]')]
    .map((img) => img.getAttribute("src"))
    .filter((src): src is string => !!src && isPhotoUrl(src))
    .filter((src) => !src.includes("logo") && !src.includes("favicon"))
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

export const schroniskoKoninAdapter = createAdapter({
  id: SHELTER_ID,
  name: "Schronisko dla Bezdomnych Zwierząt w Koninie",
  url: BASE_URL,
  sourceUrl: SOURCE_URL,
  city: "Konin",
  region: "Wielkopolskie",

  fetch: (config) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient

      const fetchPage = (pageUrl: string) =>
        client.get(pageUrl).pipe(
          Effect.flatMap((res) => res.text),
          Effect.scoped,
          Effect.mapError(
            (cause) =>
              new ScrapeError({
                shelterId: config.shelterId,
                cause,
                message: `Failed to fetch ${pageUrl}`,
              }),
          ),
        )

      const firstPageHtml = yield* fetchPage(SOURCE_URL)

      const { document } = parseHTML(firstPageHtml)
      const paginationLinks = [...document.querySelectorAll('a[href*="?start="]')]
        .map((a) => a.getAttribute("href"))
        .filter((href): href is string => !!href)
        .map((href) => (href.startsWith("http") ? href : `${BASE_URL}${href}`))

      const uniquePageUrls = [...new Set(paginationLinks)].slice(0, MAX_PAGES - 1)

      const additionalPages = yield* Effect.all(
        uniquePageUrls.map((pageUrl) => fetchPage(pageUrl).pipe(Effect.catchAll(() => Effect.succeed("")))),
        { concurrency: 3 },
      )

      return [firstPageHtml, ...additionalPages].join("\n")
    }),

  parse: (html, config) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const dogUrls = extractKoninDogUrlsFromListing(html)

      const dogs = yield* Effect.all(
        dogUrls.map((url) =>
          Effect.gen(function* () {
            const detailHtml = yield* client.get(url).pipe(Effect.flatMap((r) => r.text), Effect.scoped)
            return extractKoninDogFromDetailPage(detailHtml, url)
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
            message: "Failed to parse Schronisko Konin pages",
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
