import { Effect } from "effect"
import { HttpClient } from "@effect/platform"
import { parseHTML } from "linkedom"
import { createAdapter, type RawDogData } from "../adapter.js"
import { ScrapeError, ParseError } from "@dogpile/core"

const SHELTER_ID = "otoz-sompolno"
const BASE_URL = "https://otoz.pl"
const SOURCE_URL = `${BASE_URL}/adopcje-zwierzat-sompolno/`

const MAX_LISTING_PAGES = 10
const MAX_DOGS = 150
const MAX_PHOTOS = 20

type DomQueryable = {
  readonly querySelector: (selectors: string) => DomElement | null
  readonly querySelectorAll: (selectors: string) => Iterable<DomElement>
}

type DomElement = DomQueryable & {
  readonly textContent: string | null
  readonly getAttribute: (name: string) => string | null
  readonly cloneNode: (deep?: boolean) => DomElement
  readonly remove: () => void
}

type DomDocument = DomQueryable & {
  readonly body: DomElement
}

const parseDocument = (html: string): DomDocument => {
  const parsed = parseHTML(html) as unknown as { document?: unknown }
  const doc = parsed.document as any
  if (!doc || typeof doc.querySelector !== "function" || !doc.body) {
    throw new Error("Invalid HTML document")
  }
  return doc as DomDocument
}

const normalizeUrl = (href: string): string | null => {
  try {
    const url = new URL(href, BASE_URL)
    url.hash = ""
    if (url.origin !== BASE_URL) return null
    return url.toString()
  } catch {
    return null
  }
}

export const extractSompolnoDogUrlsFromListingHtml = (html: string): readonly string[] => {
  const document = parseDocument(html)
  const urls = new Set<string>()

  const links = [...document.querySelectorAll('a[href*="/zwierze/"]')]
    .map((a) => a.getAttribute("href"))
    .filter((href): href is string => typeof href === "string" && href.length > 0)

  for (const href of links) {
    if (urls.size >= MAX_DOGS) break

    const normalized = normalizeUrl(href)
    if (!normalized) continue

    const url = new URL(normalized)
    const segments = url.pathname.split("/").filter(Boolean)
    if (segments[0] !== "zwierze" || segments.length !== 2) continue

    urls.add(normalized)
  }

  return [...urls]
}

const parseSex = (text: string): "male" | "female" | "unknown" => {
  const lower = text.toLowerCase()
  if (lower.includes("samiec")) return "male"
  if (lower.includes("samiczka") || lower.includes("samica")) return "female"
  return "unknown"
}

export const parseSompolnoDogDetailPageHtml = (html: string, url: string): RawDogData => {
  const document = parseDocument(html)

  const slug = new URL(url).pathname.split("/").filter(Boolean).pop() ?? url
  const externalId = slug

  const name = (
    document.querySelector("h1")?.textContent?.trim() ??
    document.querySelector(".entry-title")?.textContent?.trim() ??
    slug
  )

  const tableRows = [...document.querySelectorAll("table tr, .pet-info tr, .entry-content tr")]
  let sex: "male" | "female" | "unknown" = "unknown"

  for (const row of tableRows) {
    const cells = [...row.querySelectorAll("td, th")]
    if (cells.length < 2) continue
    const label = cells[0]?.textContent?.toLowerCase().trim() ?? ""
    const value = cells[1]?.textContent?.trim() ?? ""
    if (label.includes("płeć")) {
      sex = parseSex(value)
    }
  }

  const descriptionEl = document.querySelector(".entry-content") ?? document.body
  const descClone = descriptionEl.cloneNode(true)
  const removeSelectors = "img,style,script,form,table,nav,.gallery,.wp-block-gallery,h1,h2"
  for (const el of [...descClone.querySelectorAll(removeSelectors)]) el.remove()

  const rawDescription = descClone.textContent
    ?.split("\n")
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0)
    .join("\n")
    .trim() ?? ""

  const photoUrls = new Set<string>()

  const imgSrcs = [
    ...document.querySelectorAll('.entry-content img[src], .wp-post-image[src], a[href*="uploads"] img[src]'),
  ]
    .map((img) => img.getAttribute("src"))
    .filter((src): src is string => typeof src === "string" && src.length > 0)

  for (const src of imgSrcs) {
    if (photoUrls.size >= MAX_PHOTOS) break
    const normalized = normalizeUrl(src)
    if (normalized && normalized.includes("/uploads/")) {
      photoUrls.add(normalized)
    }
  }

  const galleryLinks = [...document.querySelectorAll('a[href*="/uploads/"]')]
    .map((a) => a.getAttribute("href"))
    .filter((href): href is string => typeof href === "string" && href.length > 0)

  for (const href of galleryLinks) {
    if (photoUrls.size >= MAX_PHOTOS) break
    const normalized = normalizeUrl(href)
    if (normalized && /\.(jpg|jpeg|png|webp)/i.test(normalized)) {
      photoUrls.add(normalized)
    }
  }

  return {
    fingerprint: `${SHELTER_ID}:${externalId}`,
    externalId,
    name,
    rawDescription,
    photos: [...photoUrls].slice(0, MAX_PHOTOS),
    sex,
    sourceUrl: url,
  }
}

const extractMaxListingPage = (document: DomDocument): number => {
  const pageNumbers = [...document.querySelectorAll(".pagination a, .nav-links a, a.page-numbers")]
    .map((a) => a.textContent?.trim() ?? "")
    .map((text) => Number.parseInt(text, 10))
    .filter((n) => Number.isFinite(n))

  const maxPage = pageNumbers.reduce((max, n) => Math.max(max, n), 1)
  return Math.min(MAX_LISTING_PAGES, maxPage)
}

export const otozSompolnoAdapter = createAdapter({
  id: SHELTER_ID,
  name: "OTOZ Animals Schronisko w Sompolnie",
  url: BASE_URL,
  sourceUrl: SOURCE_URL,
  city: "Sompolno",
  region: "Wielkopolskie",

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
        (_, i) => `${SOURCE_URL}page/${i + 2}/`,
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
          listingPages
            .flatMap((pageHtml) => {
              if (pageHtml.length === 0) return []
              return extractSompolnoDogUrlsFromListingHtml(pageHtml)
            })
        ),
      ].slice(0, MAX_DOGS)

      const dogs = yield* Effect.all(
        dogUrls.map((url) =>
          client.get(url).pipe(
            Effect.flatMap((res) => res.text),
            Effect.scoped,
            Effect.map((detailHtml) => parseSompolnoDogDetailPageHtml(detailHtml, url)),
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
        message: "Failed to parse OTOZ Sompolno pages",
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
