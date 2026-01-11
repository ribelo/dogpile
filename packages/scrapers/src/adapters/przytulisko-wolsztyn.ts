import { Effect } from "effect"
import { HttpClient } from "@effect/platform"
import { parseHTML } from "linkedom"
import { createAdapter, type RawDogData } from "../adapter.js"
import { ScrapeError, ParseError } from "@dogpile/core"

const SHELTER_ID = "przytulisko-wolsztyn"
const BASE_URL = "https://zwierzaki.wolsztyn.pl"
const SOURCE_URL = `${BASE_URL}/przytulisko.html`

const MAX_DOGS = 50
const MAX_PHOTOS = 10

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

export const extractWolsztynDogUrlsFromListing = (html: string): readonly string[] => {
  const document = parseDocument(html)
  const urls = new Set<string>()

  const links = [...document.querySelectorAll('a[href*="do=szczegoly"]')]
    .map((a) => a.getAttribute("href"))
    .filter((href): href is string =>
      typeof href === "string" &&
      href.includes("do=szczegoly") &&
      href.includes("id=")
    )

  for (const href of links) {
    if (urls.size >= MAX_DOGS) break
    const fullUrl = href.startsWith("http") ? href : BASE_URL + "/" + href.replace(/^\.?\//, "")
    urls.add(fullUrl)
  }
  return [...urls]
}

export const extractWolsztynDogFromDetailPage = (html: string, url: string): RawDogData => {
  const document = parseDocument(html)

  const idMatch = url.match(/id=(\d+)/)
  const externalId = idMatch ? idMatch[1] : url

  const h1 = document.querySelector("h1")
  const headerText = h1?.textContent?.trim() ?? ""

  const tds = [...document.querySelectorAll("td")]
  const descTd = tds.find((td) => {
    const text = td.textContent ?? ""
    return text.length > 100 && text.includes("szuka domu")
  })

  const rawDescription = descTd?.textContent?.trim().slice(0, 5000) ?? ""

  const nameMatch = rawDescription.match(/([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+)\s+z\s+Przytuliska/)
    ?? rawDescription.match(/^([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+)/)
  const name = nameMatch ? nameMatch[1] : externalId

  const textLower = rawDescription.toLowerCase()
  let sex: "male" | "female" | "unknown" = "unknown"
  if (textLower.includes("samczyk") || textLower.includes("samiec") || textLower.includes("chłopak")) {
    sex = "male"
  } else if (textLower.includes("suczka") || textLower.includes("samica") || textLower.includes("sunia")) {
    sex = "female"
  }

  const photos = [...new Set(
    [...document.querySelectorAll('img[src*="/foto/"]')]
      .map((img) => img.getAttribute("src"))
      .filter((src): src is string =>
        typeof src === "string" &&
        src.includes("/foto/") &&
        !src.includes("mini")
      )
      .map((src) => {
        if (src.startsWith("http")) return src
        return BASE_URL + "/" + src.replace(/^\.?\//, "")
      })
  )].slice(0, MAX_PHOTOS)

  const largePicLinks = [...document.querySelectorAll('a[href*="/foto/duze/"]')]
    .map((a) => a.getAttribute("href"))
    .filter((href): href is string => typeof href === "string")
    .map((href) => {
      if (href.startsWith("http")) return href
      return BASE_URL + "/" + href.replace(/^\.?\//, "")
    })

  const allPhotos = [...new Set([...largePicLinks, ...photos])].slice(0, MAX_PHOTOS)

  return {
    fingerprint: `${SHELTER_ID}:${externalId}`,
    externalId,
    name,
    rawDescription,
    photos: allPhotos,
    sex,
    sourceUrl: url,
  }
}

export const przytuliskoWolsztynAdapter = createAdapter({
  id: SHELTER_ID,
  name: "Przytulisko w Wolsztynie (Fundacja Pieskowo)",
  url: BASE_URL,
  sourceUrl: SOURCE_URL,
  city: "Wolsztyn",

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

      const dogUrls = extractWolsztynDogUrlsFromListing(html)

      const dogs = yield* Effect.all(
        dogUrls.map((url) =>
          client.get(url).pipe(
            Effect.flatMap((res) => res.text),
            Effect.scoped,
            Effect.map((detailHtml) => extractWolsztynDogFromDetailPage(detailHtml, url)),
            Effect.catchAll(() => Effect.succeed(null)),
          )
        ),
        { concurrency: 3 }
      )

      return dogs.filter((d) => d !== null) as RawDogData[]
    }).pipe(
      Effect.mapError((cause) => new ParseError({
        shelterId: config.shelterId,
        cause,
        message: "Failed to parse Przytulisko Wolsztyn pages",
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
