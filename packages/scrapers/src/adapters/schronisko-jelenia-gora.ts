import { Effect } from "effect"
import { HttpClient } from "@effect/platform"
import { parseHTML } from "linkedom"
import { createAdapter, type RawDogData } from "../adapter.js"
import { ScrapeError, ParseError } from "@dogpile/core"

const SHELTER_ID = "schronisko-jelenia-gora"
const BASE_URL = "http://schronisko.mpgk.jgora.pl"
const SOURCE_URL = `${BASE_URL}/zwierzaki/psy/`

const MAX_LISTING_PAGES = 5
const MAX_DOGS = 100
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
    url.search = ""

    let pathname = url.pathname
    while (pathname.endsWith("//")) pathname = pathname.slice(0, -1)
    url.pathname = pathname

    if (url.origin !== BASE_URL) return null
    return url.toString()
  } catch {
    return null
  }
}

const extractMaxListingPage = (document: DomDocument): number => {
  const pageNumbers = [...document.querySelectorAll(".custom-pagination a.page-numbers")]
    .map((a) => a.textContent?.trim() ?? "")
    .map((text) => Number.parseInt(text, 10))
    .filter((n) => Number.isFinite(n))

  const maxPage = pageNumbers.reduce((max, n) => Math.max(max, n), 1)
  return Math.min(MAX_LISTING_PAGES, maxPage)
}

const extractDogDetailUrls = (document: DomDocument): readonly string[] => {
  const urls = new Set<string>()

  const hrefs = [...document.querySelectorAll(".entry-row a[href]")]
    .map((a) => a.getAttribute("href"))
    .filter((href): href is string => typeof href === "string" && href.length > 0)

  for (const href of hrefs) {
    if (urls.size >= MAX_DOGS) break

    const normalized = normalizeUrl(href)
    if (!normalized) continue

    const url = new URL(normalized)
    const segments = url.pathname.split("/").filter(Boolean)

    if (segments.length !== 1) continue
    const slug = segments[0] ?? ""
    if (slug.length === 0) continue
    if (slug[0] < "0" || slug[0] > "9") continue

    urls.add(normalized)
  }

  return [...urls]
}

const extractDogDetail = (html: string, url: string): RawDogData => {
  const document = parseDocument(html)

  const urlObj = new URL(url)
  const externalId = urlObj.pathname.split("/").filter(Boolean).pop() ?? url

  const name = (
    document.querySelector("#single-more-a_main h2")?.textContent ??
    document.querySelector("h2")?.textContent ??
    externalId
  ).trim()

  const content =
    document.querySelector("#single-more-a_main .col-md-offset-2.col-md-8") ??
    document.querySelector("#single-more-a_main") ??
    document.body

  const contentClone = content.cloneNode(true)
  const removeSelectors = "img,style,script,form,.wpcf7,.gallery,h2,h4,nav"
  for (const el of [...contentClone.querySelectorAll(removeSelectors)]) el.remove()

  const rawDescription = contentClone.textContent
    ?.split("\n")
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0)
    .join("\n")
    .trim() ?? ""

  const photoUrls = new Set<string>()

  const mainPhoto = document
    .querySelector("#single-more-a_main img.wp-post-image")
    ?.getAttribute("src")

  const normalizedMain = mainPhoto ? normalizeUrl(mainPhoto) : null
  if (normalizedMain) photoUrls.add(normalizedMain)

  const galleryLinks = [...document.querySelectorAll("#single-more-a_main .gallery a[href]")]
    .map((a) => a.getAttribute("href"))
    .filter((href): href is string => typeof href === "string" && href.length > 0)

  for (const href of galleryLinks) {
    if (photoUrls.size >= MAX_PHOTOS) break
    const normalized = normalizeUrl(href)
    if (normalized) photoUrls.add(normalized)
  }

  const photos = [...photoUrls].slice(0, MAX_PHOTOS)

  return {
    fingerprint: `${SHELTER_ID}:${externalId}`,
    externalId,
    name,
    rawDescription,
    photos,
    sex: "unknown",
    sourceUrl: url,
  }
}

export const schroniskoJeleniaGoraAdapter = createAdapter({
  id: SHELTER_ID,
  name: "Schronisko dla Małych Zwierząt w Jeleniej Górze",
  url: BASE_URL,
  sourceUrl: SOURCE_URL,
  city: "Jelenia Góra",

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
              return extractDogDetailUrls(parseDocument(pageHtml))
            })
        ),
      ].slice(0, MAX_DOGS)

      const dogs = yield* Effect.all(
        dogUrls.map((url) =>
          client.get(url).pipe(
            Effect.flatMap((res) => res.text),
            Effect.scoped,
            Effect.map((detailHtml) => extractDogDetail(detailHtml, url)),
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
        message: "Failed to parse Schronisko Jelenia Góra pages",
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
