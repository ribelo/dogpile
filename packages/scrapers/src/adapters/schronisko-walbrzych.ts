import { Effect } from "effect"
import { HttpClient } from "@effect/platform"
import { parseHTML } from "linkedom"
import { createAdapter, type RawDogData } from "../adapter.js"
import { ScrapeError, ParseError } from "@dogpile/core"

const SHELTER_ID = "schronisko-walbrzych"
const BASE_URL = "https://schronisko.walbrzych.pl"
const SOURCE_URL = `${BASE_URL}/portfolio-type/psy-duze/`

const LISTING_URLS = [
  `${BASE_URL}/portfolio-type/psy-duze/`,
  `${BASE_URL}/portfolio-type/psy-srednie/`,
  `${BASE_URL}/portfolio-type/psy-male/`,
  `${BASE_URL}/portfolio-type/psy-najdluzej-przebywajace-w-schronisku/`,
] as const

const MAX_DOG_URLS = 300

const isPhotoUrl = (url: string): boolean =>
  /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(url)

export const extractWalbrzychDogUrlsFromListing = (html: string): readonly string[] => {
  const { document } = parseHTML(html)
  const urls = [...document.querySelectorAll("#portfoliowrapper a.portfoliolink")]
    .map((a) => a.getAttribute("href"))
    .filter((href): href is string => !!href)
    .filter((href) => href.startsWith(`${BASE_URL}/portfolio/`))

  return [...new Set(urls)].slice(0, MAX_DOG_URLS)
}

export const extractWalbrzychDogFromDetailPage = (html: string, url: string): RawDogData => {
  const { document } = parseHTML(html)

  const bodyClass = document.body.getAttribute("class") ?? ""
  const postIdMatch =
    bodyClass.match(/\bpostid-(\d+)\b/) ??
    document.querySelector('article[id^="post-"]')?.id.match(/\bpost-(\d+)\b/)

  const externalId = postIdMatch ? postIdMatch[1] : url.split("/").filter(Boolean).pop()!

  const entryContent = document.querySelector(".entry-content")
  const paragraphs = entryContent ? [...entryContent.querySelectorAll("p")] : []
  const rawDescriptionFromParagraphs = paragraphs
    .map((p) => p.textContent?.trim() ?? "")
    .filter((s) => s.length > 0)
    .join("\n")

  const rawDescriptionFromOg =
    document.querySelector('meta[property="og:description"]')?.getAttribute("content")?.trim() ?? ""

  const rawDescription = rawDescriptionFromParagraphs || rawDescriptionFromOg || "No description"

  const nameFromImie = paragraphs
    .map((p) => p.textContent?.trim() ?? "")
    .find((s) => s.toLowerCase().startsWith("imię:"))
    ?.split(":")
    .slice(1)
    .join(":")
    .trim()

  const nameFromTitle =
    document.querySelector("h1.entry-title")?.textContent?.trim() ??
    document.querySelector("title")?.textContent?.trim() ??
    "Unknown"

  const name = nameFromImie || nameFromTitle

  const photos = [
    ...new Set(
      [...document.querySelectorAll('a.lightboxhover[href*="/wp-content/uploads/"]')]
        .map((a) => a.getAttribute("href"))
        .filter((href): href is string => !!href && isPhotoUrl(href)),
    ),
  ]

  const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content")
  if (ogImage && isPhotoUrl(ogImage) && !photos.includes(ogImage)) {
    photos.unshift(ogImage)
  }

  return {
    fingerprint: `${SHELTER_ID}:${externalId}`,
    externalId,
    name,
    rawDescription,
    photos,
    sex: "unknown" as const,
    sourceUrl: url,
  }
}

export const schroniskoWalbrzychAdapter = createAdapter({
  id: SHELTER_ID,
  name: "Schronisko dla zwierząt w Wałbrzychu",
  url: BASE_URL,
  sourceUrl: SOURCE_URL,
  city: "Wałbrzych",

  fetch: (config) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient

      const fetchPage = (url: string) =>
        client.get(url).pipe(
          Effect.flatMap((res) => res.text),
          Effect.scoped,
          Effect.mapError(
            (cause) =>
              new ScrapeError({
                shelterId: config.shelterId,
                cause,
                message: `Failed to fetch ${url}`,
              }),
          ),
        )

      const pages = yield* Effect.all(LISTING_URLS.map(fetchPage), { concurrency: 3 })
      return pages.join("\n")
    }),

  parse: (html, config) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const dogUrls = extractWalbrzychDogUrlsFromListing(html)

      const dogs = yield* Effect.all(
        dogUrls.map((url) =>
          Effect.gen(function* () {
            const detailHtml = yield* client.get(url).pipe(Effect.flatMap((r) => r.text), Effect.scoped)
            return extractWalbrzychDogFromDetailPage(detailHtml, url)
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
            message: "Failed to parse Schronisko Wałbrzych pages",
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
