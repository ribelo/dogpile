import { Effect } from "effect"
import { HttpClient } from "@effect/platform"
import { parseHTML } from "linkedom"
import { createAdapter, type RawDogData } from "../adapter.js"
import { ScrapeError, ParseError } from "@dogpile/core"

const SHELTER_ID = "fundacja-tara"
const BASE_URL = "https://fundacjatara.info"
const SOURCE_URL = `${BASE_URL}/tag/dom-dla-psa/`

const MAX_LISTING_PAGES = 3
const MAX_DOG_URLS = 50

const isPhotoUrl = (url: string): boolean =>
  /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(url)

const normalizeWpImageUrl = (url: string): string =>
  url.replace(/-\d+x\d+(?=\.(?:jpe?g|png|webp)(?:\?|$))/i, "")

const normalizeDogName = (name: string): string =>
  name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^\p{L}/u, (m) => m.toUpperCase())

const looksLikeDogName = (candidate: string): boolean => {
  const normalized = candidate.trim().toLowerCase()
  if (normalized.length < 2 || normalized.length > 30) return false
  if (!/^\p{L}[\p{L}\s-]*$/u.test(candidate.trim())) return false

  const blocked = new Set([
    "pies",
    "piesek",
    "kundel",
    "kundelki",
    "pomoc",
    "szczeniak",
    "szczeniaki",
    "szczeniaczki",
  ])
  return !blocked.has(normalized)
}

export const extractFundacjaTaraDogUrlsFromListing = (html: string): readonly string[] => {
  const { document } = parseHTML(html)

  const primary = [...document.querySelectorAll("article.latestPost h2.title.front-view-title a")]
  const fallback = [...document.querySelectorAll("h2.title.front-view-title a")]
  const anchors = primary.length > 0 ? primary : fallback

  const urls = anchors
    .map((a) => a.getAttribute("href"))
    .filter((href): href is string => !!href)
    .filter((href) => href.startsWith(`${BASE_URL}/`))
    .filter((href) => !href.includes("/tag/"))
    .filter((href) => !href.includes("/category/"))
    .filter((href) => !href.includes("/author/"))
    .filter((href) => !href.includes("/wp-content/"))

  return [...new Set(urls)].slice(0, MAX_DOG_URLS)
}

const extractNameFromText = (text: string): string | null => {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (!normalized) return null

  const fromImie = normalized.match(/\bMam na imię\s+([\p{L}][\p{L}-]{1,30})\b/iu)
  if (fromImie) return fromImie[1]

  const fromXTo = normalized.match(/\b([\p{L}][\p{L}-]{1,30})\s+to\b/iu)
  if (fromXTo) return fromXTo[1]

  return null
}

export const extractFundacjaTaraDogFromDetailPage = (html: string, url: string): RawDogData => {
  const { document } = parseHTML(html)

  const postIdMatch =
    document.querySelector('#content_box [id^="post-"]')?.id.match(/\bpost-(\d+)\b/) ??
    document.querySelector('article[id^="post-"]')?.id.match(/\bpost-(\d+)\b/)

  const externalId = postIdMatch ? postIdMatch[1] : url.split("/").filter(Boolean).pop()!

  const contentRoot =
    document.querySelector('.thecontent[itemprop="articleBody"]') ??
    document.querySelector(".thecontent") ??
    document.querySelector(".entry-content")

  const paragraphs = contentRoot ? [...contentRoot.querySelectorAll("p")] : []
  const paragraphText = paragraphs
    .map((p) => p.textContent?.trim() ?? "")
    .filter((s) => s.length > 0)

  const rawDescription = paragraphText.join("\n") || "No description"

  const altCandidates = contentRoot
    ? [...contentRoot.querySelectorAll("img[alt]")]
        .map((img) => img.getAttribute("alt")?.trim() ?? "")
        .filter((s) => looksLikeDogName(s))
    : []

  const nameFromAlt = altCandidates.length > 0 ? normalizeDogName(altCandidates[0]) : null
  const nameFromText = extractNameFromText(rawDescription)
  const nameFromTitle =
    document.querySelector("h1.entry-title")?.textContent?.trim() ??
    document.querySelector("title")?.textContent?.trim() ??
    "Unknown"

  const name = nameFromAlt ?? (nameFromText ? normalizeDogName(nameFromText) : null) ?? nameFromTitle

  const photoUrls: string[] = []

  if (contentRoot) {
    for (const img of [...contentRoot.querySelectorAll("img")]) {
      const src = img.getAttribute("src")?.trim()
      if (src) photoUrls.push(src)

      const srcset = img.getAttribute("srcset")?.trim()
      if (srcset) {
        const candidates = srcset
          .split(",")
          .map((entry: string) => entry.trim().split(/\s+/)[0])
          .filter(Boolean)
        photoUrls.push(...candidates)
      }
    }
  }

  const photos = [
    ...new Set(
      photoUrls
        .map((u) => (u.startsWith("//") ? `https:${u}` : u))
        .map((u) => (u.startsWith("/") ? `${BASE_URL}${u}` : u))
        .filter((u) => u.includes("/wp-content/uploads/"))
        .map(normalizeWpImageUrl)
        .filter((u) => isPhotoUrl(u))
        .filter((u) => !u.toLowerCase().includes("taralogo")),
    ),
  ]

  const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content")?.trim()
  if (ogImage && isPhotoUrl(ogImage)) {
    const normalizedOg = normalizeWpImageUrl(ogImage)
    if (!photos.includes(normalizedOg)) photos.unshift(normalizedOg)
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

export const fundacjaTaraAdapter = createAdapter({
  id: SHELTER_ID,
  name: "Fundacja Tara - Schronisko dla Koni",
  url: BASE_URL,
  sourceUrl: SOURCE_URL,
  city: "Piskorzyna",

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

      const firstPage = yield* fetchPage(SOURCE_URL)
      const pages = [firstPage]

      const { document } = parseHTML(firstPage)
      const pageLinks = [...document.querySelectorAll(`a[href*="/tag/dom-dla-psa/page/"]`)]
      const detectedMaxPage = pageLinks.reduce((max, a) => {
        const href = a.getAttribute("href")
        const match = href?.match(/\/page\/(\d+)\//)
        return match ? Math.max(max, parseInt(match[1])) : max
      }, 1)

      const maxPage = Math.min(detectedMaxPage, MAX_LISTING_PAGES)

      if (maxPage > 1) {
        const remainingPages = yield* Effect.all(
          Array.from({ length: maxPage - 1 }, (_, i) => fetchPage(`${SOURCE_URL}page/${i + 2}/`)),
          { concurrency: 3 },
        )
        pages.push(...remainingPages)
      }

      return pages.join("\n")
    }),

  parse: (html, config) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const dogUrls = extractFundacjaTaraDogUrlsFromListing(html)

      const dogs = yield* Effect.all(
        dogUrls.map((url) =>
          Effect.gen(function* () {
            const detailHtml = yield* client.get(url).pipe(Effect.flatMap((r) => r.text), Effect.scoped)
            const dog = extractFundacjaTaraDogFromDetailPage(detailHtml, url)

            const title = dog.name.trim().toLowerCase()
            if (title.includes("szczeni")) return null

            return dog
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
            message: "Failed to parse Fundacja Tara pages",
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
