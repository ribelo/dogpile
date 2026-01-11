import { Effect } from "effect"
import { HttpClient } from "@effect/platform"
import { parseHTML } from "linkedom"
import { createAdapter, type RawDogData } from "../adapter.js"
import { ScrapeError, ParseError } from "@dogpile/core"

const SHELTER_ID = "schronisko-pila-miluszkow"
const BASE_URL = "https://schronisko.pila.pl"
const SOURCE_URL = `${BASE_URL}/zwierzeta/oczekujace/psy/`

const MAX_LISTING_PAGES = 10
const MAX_DOGS = 150
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

const extractDogUrlsFromListing = (document: DomDocument): readonly string[] => {
  const urls = new Set<string>()
  const links = [...document.querySelectorAll('a[href*="/zwierzeta/"]')]
    .map((a) => a.getAttribute("href"))
    .filter((href): href is string =>
      typeof href === "string" &&
      /^https:\/\/schronisko\.pila\.pl\/zwierzeta\/\d+\/?$/.test(href)
    )

  for (const href of links) {
    if (urls.size >= MAX_DOGS) break
    urls.add(href.replace(/\/$/, "") + "/")
  }
  return [...urls]
}

const extractMaxListingPage = (document: DomDocument): number => {
  const pageLinks = [...document.querySelectorAll('a[href*="/zwierzeta/oczekujace/psy/str."]')]
    .map((a) => a.getAttribute("href"))
    .filter((href): href is string => typeof href === "string")

  const pageNumbers = pageLinks
    .map((href) => {
      const match = href.match(/str\.(\d+)/)
      return match ? parseInt(match[1], 10) : 0
    })
    .filter((n) => Number.isFinite(n) && n > 0)

  const maxPage = pageNumbers.reduce((max, n) => Math.max(max, n), 1)
  return Math.min(MAX_LISTING_PAGES, maxPage)
}

export const extractPilaMiluszkowDogFromDetailPage = (html: string, url: string): RawDogData => {
  const document = parseDocument(html)

  const urlMatch = url.match(/\/zwierzeta\/(\d+)\/?$/)
  const externalId = urlMatch ? urlMatch[1] : url.split("/").filter(Boolean).pop() ?? url

  const h2 = document.querySelector("h2")
  const name = h2?.textContent?.replace(/^\*+|\*+$/g, "").trim() ?? externalId

  const rows = [...document.querySelectorAll("td")]
  const rawDescParts: string[] = []
  for (let i = 0; i < rows.length; i += 2) {
    const label = rows[i]?.textContent?.trim().toLowerCase() ?? ""
    const value = rows[i + 1]?.textContent?.trim() ?? ""
    if (label && value && !label.includes("fiv") && !label.includes("felv")) {
      rawDescParts.push(`${label} ${value}`)
    }
  }

  const sexLabel = rows.find((r) => r.textContent?.toLowerCase().includes("płeć"))
  const sexValue = sexLabel ? rows[rows.indexOf(sexLabel) + 1]?.textContent?.trim().toLowerCase() : null
  const sex = sexValue === "pies" ? "male" as const : sexValue === "suka" ? "female" as const : "unknown" as const

  const photos = [...new Set(
    [...document.querySelectorAll('a[href*="/images/zwierzeta/"] img')]
      .map((img) => {
        const parent = img as unknown as { parentElement?: { getAttribute: (name: string) => string | null } }
        return parent.parentElement?.getAttribute("href")
      })
      .concat(
        [...document.querySelectorAll('img[src*="/images/zwierzeta/"]')]
          .map((img) => img.getAttribute("src"))
      )
      .filter((src): src is string =>
        typeof src === "string" &&
        src.includes("/images/zwierzeta/") &&
        !src.includes("logo")
      )
  )].slice(0, MAX_PHOTOS)

  return {
    fingerprint: `${SHELTER_ID}:${externalId}`,
    externalId,
    name,
    rawDescription: rawDescParts.join("\n"),
    photos,
    sex,
    sourceUrl: url,
  }
}

export const schroniskoPilaMiluszkowAdapter = createAdapter({
  id: SHELTER_ID,
  name: "Schronisko Miluszków w Pile",
  url: BASE_URL,
  sourceUrl: SOURCE_URL,
  city: "Piła",

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
        (_, i) => `${SOURCE_URL}str.${i + 2}`,
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
            return extractDogUrlsFromListing(parseDocument(pageHtml))
          })
        ),
      ].slice(0, MAX_DOGS)

      const dogs = yield* Effect.all(
        dogUrls.map((url) =>
          client.get(url).pipe(
            Effect.flatMap((res) => res.text),
            Effect.scoped,
            Effect.map((detailHtml) => extractPilaMiluszkowDogFromDetailPage(detailHtml, url)),
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
        message: "Failed to parse Schronisko Piła Miluszków pages",
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
