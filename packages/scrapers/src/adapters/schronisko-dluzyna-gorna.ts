import { Effect } from "effect"
import { HttpClient } from "@effect/platform"
import { parseHTML } from "linkedom"
import { createAdapter, type RawDogData } from "../adapter.js"
import { ScrapeError, ParseError } from "@dogpile/core"

const SHELTER_ID = "schronisko-dluzyna-gorna"
const BASE_URL = "https://schroniskodg.pl"
const SOURCE_URL = "https://schroniskodg.pl/zw-kat/psy-do-adopcji/"

const MAX_LIST_PAGES = 25
const MAX_DOGS = 250
const MAX_PHOTOS = 25

type NodeListLike<T> = Iterable<T> & { readonly length: number }
type HtmlNode = {
  readonly textContent?: string | null
  querySelector: (selector: string) => HtmlNode | null
  querySelectorAll: (selector: string) => NodeListLike<HtmlNode>
  getAttribute?: (name: string) => string | null
}

const normalizeText = (text: string) => text.replace(/\s+/g, " ").trim()

const cleanImageUrl = (url: string) => url.replace(/-\d+x\d+(\.[a-z]+)$/i, "$1")

const getPathLastSegment = (url: string): string => {
  const segments = url.split("/").filter(Boolean)
  return segments[segments.length - 1] ?? url
}

const getPageNumberFromHref = (href: string): number | null => {
  const segments = href.split("/").filter(Boolean)
  const pageIndex = segments.lastIndexOf("page")
  if (pageIndex === -1) return null
  const num = Number(segments[pageIndex + 1])
  return Number.isFinite(num) ? num : null
}

const detailsValue = (doc: HtmlNode, label: string): string | null => {
  const normalizedLabel = normalizeText(label).toLowerCase()
  const items = Array.from(doc.querySelectorAll(".project_details .project_details_item")).slice(0, 50)
  for (const item of items) {
    const title = item.querySelector(".project_details_item_title")?.textContent
    if (!title) continue
    if (normalizeText(title).toLowerCase() !== normalizedLabel) continue
    const value =
      item.querySelector(".project_details_item_desc_element")?.textContent ??
      item.querySelector(".project_details_item_desc")?.textContent
    return value ? normalizeText(value) : null
  }
  return null
}

const parseSex = (value: string | null): "male" | "female" | "unknown" => {
  const normalized = (value ?? "").toLowerCase()
  if (normalized.includes("samiec")) return "male"
  if (normalized.includes("samica")) return "female"
  return "unknown"
}

export const extractDogUrlsFromListingHtml = (html: string): readonly string[] => {
  const { document } = parseHTML(html)
  const articles = Array.from((document as unknown as HtmlNode).querySelectorAll("article.cmsmasters_archive_type.project"))
    .slice(0, MAX_DOGS)
  const urls = articles
    .map((article) => article.querySelector(`a[href^="${BASE_URL}/zwierzak/"]`)?.getAttribute?.("href"))
    .filter((href): href is string => !!href)
  return [...new Set(urls)]
}

export const parseDogDetailPageHtml = (html: string, sourceUrl: string): RawDogData => {
  const { document } = parseHTML(html)
  const doc = document as unknown as HtmlNode

  const name = normalizeText(
    doc.querySelector(".project_content .cmsmasters_project_title.entry-title")?.textContent ??
      doc.querySelector("h1")?.textContent ??
      doc.querySelector("title")?.textContent?.split("-")[0] ??
      "Unknown",
  )

  const externalId = detailsValue(doc, "Numer rejestru") ?? getPathLastSegment(sourceUrl)

  const descriptionRoot = doc.querySelector(".project_content .cmsmasters_project_content.entry-content")
  const rawDescription = (descriptionRoot ? Array.from(descriptionRoot.querySelectorAll("p")) : [])
    .map((p) => normalizeText(p.textContent ?? ""))
    .filter((s) => s.length > 0)
    .filter((s) => !s.toLowerCase().includes("dane schroniska"))
    .filter((s) => !s.toLowerCase().includes("dane stowarzyszenia"))
    .join("\n")

  const projectRoot = doc.querySelector(".project_content") ?? doc
  const photoUrls: string[] = []

  const photoLinks = Array.from(projectRoot.querySelectorAll('a[href*="/wp-content/uploads/"]')).slice(0, MAX_PHOTOS * 3)
  for (const a of photoLinks) {
    if (photoUrls.length >= MAX_PHOTOS) break
    const href = a.getAttribute?.("href")
    if (!href) continue
    if (!/\.(?:jpg|jpeg|png|webp)$/i.test(href)) continue
    const cleaned = cleanImageUrl(href)
    if (!photoUrls.includes(cleaned)) photoUrls.push(cleaned)
  }

  if (photoUrls.length < MAX_PHOTOS) {
    const imgs = Array.from(projectRoot.querySelectorAll('img[src*="/wp-content/uploads/"]')).slice(0, MAX_PHOTOS * 3)
    for (const img of imgs) {
      if (photoUrls.length >= MAX_PHOTOS) break
      const src = img.getAttribute?.("src")
      if (!src) continue
      if (!/\.(?:jpg|jpeg|png|webp)$/i.test(src)) continue
      const cleaned = cleanImageUrl(src)
      if (!photoUrls.includes(cleaned)) photoUrls.push(cleaned)
    }
  }

  return {
    fingerprint: `${SHELTER_ID}:${externalId}`,
    externalId,
    name,
    rawDescription,
    photos: photoUrls,
    sex: parseSex(detailsValue(doc, "Płeć")),
    sourceUrl,
  } satisfies RawDogData
}

export const schroniskoDluzynaGornaAdapter = createAdapter({
  id: SHELTER_ID,
  name: "Schronisko dla Zwierząt Małych w Dłużynie Górnej",
  url: BASE_URL,
  sourceUrl: SOURCE_URL,
  city: "Dłużyna Górna",

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

      const firstPageHtml = yield* fetchPage(SOURCE_URL)
      const pages = [firstPageHtml]

      const { document } = parseHTML(firstPageHtml)
      const pageLinks = [...document.querySelectorAll('a.page-numbers[href*="/page/"]')]
      const discoveredMax = pageLinks.reduce<number>((max, a) => {
        const href = a.getAttribute("href")
        if (!href) return max
        const pageNum = getPageNumberFromHref(href)
        return pageNum ? Math.max(max, pageNum) : max
      }, 1)

      const maxPage = Math.min(discoveredMax, MAX_LIST_PAGES)
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
      const dogUrls = extractDogUrlsFromListingHtml(html).slice(0, MAX_DOGS)

      const dogs = yield* Effect.all(
        dogUrls.map((url) =>
          Effect.gen(function* () {
            const res = yield* client.get(url).pipe(Effect.flatMap((r) => r.text), Effect.scoped)
            return parseDogDetailPageHtml(res, url)
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
            message: "Failed to parse Schronisko Dłużyna Górna pages",
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
