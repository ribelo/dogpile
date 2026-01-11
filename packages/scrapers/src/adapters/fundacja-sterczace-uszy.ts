import { Effect } from "effect"
import { HttpClient } from "@effect/platform"
import { parseHTML } from "linkedom"
import { createAdapter, type RawDogData } from "../adapter.js"
import { ScrapeError, ParseError } from "@dogpile/core"

const SHELTER_ID = "fundacja-sterczace-uszy"
const BASE_URL = "https://www.sterczaceuszy.pl"
const SOURCE_URL = `${BASE_URL}/do-adopcji`

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
    return url.toString()
  } catch {
    return null
  }
}

export const extractSterczaceUszyDogUrlsFromListingHtml = (html: string): readonly string[] => {
  const document = parseDocument(html)
  const urls = new Set<string>()

  const links = [...document.querySelectorAll('a[href*="/do-adopcji/"]')]
    .map((a) => a.getAttribute("href"))
    .filter((href): href is string => typeof href === "string" && href.length > 0)

  for (const href of links) {
    if (urls.size >= MAX_DOGS) break

    const normalized = normalizeUrl(href)
    if (!normalized) continue

    const url = new URL(normalized)
    const segments = url.pathname.split("/").filter(Boolean)
    if (segments[0] !== "do-adopcji" || segments.length !== 2) continue

    urls.add(normalized)
  }

  return [...urls]
}

const parseSex = (text: string): "male" | "female" | "unknown" => {
  const lower = text.toLowerCase()
  if (lower.includes("on") || lower.includes("pies") || lower.includes("samiec") || lower.includes("przystojniak")) {
    return "male"
  }
  if (lower.includes("ona") || lower.includes("suczka") || lower.includes("samica") || lower.includes("piękność")) {
    return "female"
  }
  return "unknown"
}

export const parseSterczaceUszyDogDetailPageHtml = (html: string, url: string): RawDogData => {
  const document = parseDocument(html)

  const slug = new URL(url).pathname.split("/").filter(Boolean).pop() ?? url
  const externalId = slug

  const name = (
    document.querySelector(".pet-name")?.textContent?.trim() ??
    document.querySelector("h1")?.textContent?.trim() ??
    slug
  )

  let sex: "male" | "female" | "unknown" = "unknown"

  const sexLabels = [...document.querySelectorAll("h5, h6, .pet-info, .sex-label")]
  for (const el of sexLabels) {
    const text = el.textContent?.trim() ?? ""
    if (text.toLowerCase().includes("płeć")) {
      const nextEl = el.querySelector("h5, h6, span")
      const sexText = nextEl?.textContent?.trim() ?? text
      sex = parseSex(sexText)
      if (sex !== "unknown") break
    }
  }

  if (sex === "unknown") {
    const fullText = document.body.textContent ?? ""
    if (/\bona\b/i.test(fullText) && !/\bon\b/i.test(fullText)) {
      sex = "female"
    } else if (/\bon\b/i.test(fullText) && !/\bona\b/i.test(fullText)) {
      sex = "male"
    }
  }

  const descriptionEl = document.querySelector("article, .pet-description, main") ?? document.body
  const descClone = descriptionEl.cloneNode(true)
  const removeSelectors = "img,style,script,form,nav,h1,h2,.gallery,footer,header"
  for (const el of [...descClone.querySelectorAll(removeSelectors)]) el.remove()

  const rawDescription = descClone.textContent
    ?.split("\n")
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0)
    .join("\n")
    .trim() ?? ""

  const photoUrls = new Set<string>()

  const imgSrcs = [...document.querySelectorAll('img[src*="ctfassets"], img[src*="images"]')]
    .map((img) => img.getAttribute("src"))
    .filter((src): src is string => typeof src === "string" && src.length > 0)

  for (const src of imgSrcs) {
    if (photoUrls.size >= MAX_PHOTOS) break
    if (src.includes("ctfassets") || src.includes("/images/")) {
      const normalized = normalizeUrl(src)
      if (normalized) {
        photoUrls.add(normalized)
      } else if (src.startsWith("http")) {
        photoUrls.add(src.split("?")[0] ?? src)
      }
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

export const fundacjaSterczaceUszyAdapter = createAdapter({
  id: SHELTER_ID,
  name: "Fundacja Sterczące Uszy",
  url: BASE_URL,
  sourceUrl: SOURCE_URL,
  city: "Luboń",

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

      const dogUrls = extractSterczaceUszyDogUrlsFromListingHtml(html).slice(0, MAX_DOGS)

      const dogs = yield* Effect.all(
        dogUrls.map((url) =>
          client.get(url).pipe(
            Effect.flatMap((res) => res.text),
            Effect.scoped,
            Effect.map((detailHtml) => parseSterczaceUszyDogDetailPageHtml(detailHtml, url)),
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
        message: "Failed to parse Fundacja Sterczące Uszy pages",
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
