import { Effect } from "effect"
import { HttpClient } from "@effect/platform"
import { parseHTML } from "linkedom"
import { createAdapter, type RawDogData } from "../adapter.js"
import { ScrapeError, ParseError } from "@dogpile/core"

const SHELTER_ID = "schronisko-wrzesnia-psijaciel"
const BASE_URL = "https://psi-jaciel.pl"
const SOURCE_URL = `${BASE_URL}/index.php/do-adopcji/`

const MAX_LISTING_PAGES = 5
const MAX_DOGS = 100
const MAX_PHOTOS = 20

type DomElement = {
  readonly textContent: string | null
  readonly getAttribute: (name: string) => string | null
  readonly querySelectorAll: (selectors: string) => Iterable<DomElement>
  readonly querySelector: (selectors: string) => DomElement | null
}

type DomDocument = DomElement & {
  readonly body: DomElement
}

const parseDocument = (html: string): DomDocument => {
  const parsed = parseHTML(html) as unknown as { document?: unknown }
  const doc = parsed.document as DomDocument
  if (!doc || typeof doc.querySelector !== "function") {
    throw new Error("Invalid HTML document")
  }
  return doc
}

export const extractWrzesniaPsijacielDogUrlsFromListing = (html: string): readonly string[] => {
  const document = parseDocument(html)
  const urls = new Set<string>()

  const links = [...document.querySelectorAll('a[href*="/index.php/20"]')]
    .map((a) => a.getAttribute("href"))
    .filter((href): href is string =>
      typeof href === "string" &&
      href.includes("/index.php/20") &&
      !href.includes("aktualnosci") &&
      !href.includes("znalazly-dom") &&
      !href.includes("za-teczowym")
    )

  for (const href of links) {
    if (urls.size >= MAX_DOGS) break
    const fullUrl = href.startsWith("http") ? href : BASE_URL + href
    urls.add(fullUrl.replace(/\/$/, "") + "/")
  }
  return [...urls]
}

export const extractWrzesniaPsijacielDogFromDetailPage = (html: string, url: string): RawDogData => {
  const document = parseDocument(html)

  const urlMatch = url.match(/\/(\d{4}\/\d{2}\/\d{2}\/[^/]+)\/?$/)
  const slug = urlMatch ? urlMatch[1].replace(/\//g, "-") : url.split("/").filter(Boolean).pop() ?? url
  const externalId = slug

  const h1 = document.querySelector("h1")
  const name = h1?.textContent?.trim() ?? externalId

  const contentDivs = [...document.querySelectorAll(".entry-content p, .entry-content, article p")]
    .map((p) => p.textContent?.trim() ?? "")
    .filter((t) =>
      t.length > 20 &&
      !t.includes("cookie") &&
      !t.includes("Aktualności") &&
      !t.includes("Adopcja") &&
      !t.includes("WESPRZYJ")
    )

  const rawDescription = contentDivs.join("\n").slice(0, 5000)

  const genderIcon = document.querySelector('img[alt="Plec"]')
  let sex: "male" | "female" | "unknown" = "unknown"
  if (genderIcon) {
    const nextText = (genderIcon as unknown as { nextSibling?: { textContent?: string } }).nextSibling?.textContent?.toLowerCase()
    const pageText = rawDescription.toLowerCase()
    if (nextText?.includes("pies") || pageText.includes("pies")) {
      sex = "male"
    } else if (nextText?.includes("suka") || pageText.includes("suka")) {
      sex = "female"
    }
  }

  const photos = [...new Set(
    [...document.querySelectorAll('img[src*="/wp-content/uploads/"]')]
      .map((img) => img.getAttribute("src"))
      .filter((src): src is string =>
        typeof src === "string" &&
        src.includes("/wp-content/uploads/") &&
        !src.includes("template-img") &&
        !src.includes("emoji") &&
        !src.includes("-icon")
      )
  )].slice(0, MAX_PHOTOS)

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

const extractMaxListingPage = (document: DomDocument): number => {
  const pageLinks = [...document.querySelectorAll('a[href*="?paged="]')]
    .map((a) => a.getAttribute("href"))
    .filter((href): href is string => typeof href === "string")

  const pageNumbers = pageLinks
    .map((href) => {
      const match = href.match(/paged=(\d+)/)
      return match ? parseInt(match[1], 10) : 0
    })
    .filter((n) => Number.isFinite(n) && n > 0)

  const maxPage = pageNumbers.reduce((max, n) => Math.max(max, n), 1)
  return Math.min(MAX_LISTING_PAGES, maxPage)
}

export const schroniskoWrzesniaPsijacielAdapter = createAdapter({
  id: SHELTER_ID,
  name: "Stowarzyszenie Psi-jaciel Schronisko we Wrześni",
  url: BASE_URL,
  sourceUrl: SOURCE_URL,
  city: "Września",

  fetch: (config) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const response = yield* client.get(SOURCE_URL).pipe(Effect.scoped)
      return yield* response.text
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

      const firstDoc = parseDocument(html)
      const maxPage = extractMaxListingPage(firstDoc)

      const extraListingUrls = Array.from(
        { length: Math.max(0, maxPage - 1) },
        (_, i) => `${SOURCE_URL}?paged=${i + 2}`,
      )

      const extraListingPages = yield* Effect.all(
        extraListingUrls.map((url) =>
          client.get(url).pipe(
            Effect.flatMap((res) => res.text),
            Effect.scoped,
            Effect.catchAll(() => Effect.succeed("")),
          )
        ),
        { concurrency: 3 }
      )

      const listingPages = [html, ...extraListingPages]

      const dogUrls = [
        ...new Set(
          listingPages.flatMap((pageHtml) => {
            if (pageHtml.length === 0) return []
            return extractWrzesniaPsijacielDogUrlsFromListing(pageHtml)
          })
        ),
      ].slice(0, MAX_DOGS)

      const dogs = yield* Effect.all(
        dogUrls.map((url) =>
          client.get(url).pipe(
            Effect.flatMap((res) => res.text),
            Effect.scoped,
            Effect.map((detailHtml) => extractWrzesniaPsijacielDogFromDetailPage(detailHtml, url)),
            Effect.catchAll(() => Effect.succeed(null)),
          )
        ),
        { concurrency: 5 }
      )

      return dogs.filter((d) => d !== null) as RawDogData[]
    }).pipe(
      Effect.mapError((cause) => new ParseError({
        shelterId: config.shelterId,
        cause,
        message: "Failed to parse Schronisko Września Psi-jaciel pages",
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
