import { Effect } from "effect"
import { HttpClient } from "@effect/platform"
import { parseHTML } from "linkedom"
import { createAdapter, type RawDogData } from "../adapter.js"
import { ScrapeError, ParseError } from "@dogpile/core"

const SHELTER_ID = "schronisko-swidnica"
const BASE_URL = "https://schroniskoswidnica.pl"
const SOURCE_URL = `${BASE_URL}/psy-do-adopcji`

const MAX_PAGES = 25
const MAX_DOGS = 400

const toAbsoluteUrl = (href: string) => new URL(href, BASE_URL).toString()

type LinkedomDocument = ReturnType<typeof parseHTML>["document"]

const normalizeText = (text: string) =>
  text
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")

const parseSex = (text: string): "male" | "female" | "unknown" => {
  const lower = text.toLowerCase()
  if (lower.includes("samiec")) return "male"
  if (lower.includes("samica")) return "female"
  return "unknown"
}

const isDogDetailUrl = (href: string) => {
  const url = new URL(href, BASE_URL)
  const parts = url.pathname.split("/").filter(Boolean)
  return parts.length === 2 && parts[0] === "psy-do-adopcji" && parts[1].length > 0
}

const collectDogDetailUrls = (document: LinkedomDocument) =>
  [
    ...new Set(
      [...document.querySelectorAll("a.pet-box-link[href]")]
        .map((a) => a.getAttribute("href"))
        .filter((href): href is string => !!href)
        .filter(isDogDetailUrl)
        .map(toAbsoluteUrl),
    ),
  ]

const collectMaxPage = (document: LinkedomDocument) => {
  const pageLinks = [...document.querySelectorAll(".pagination a[href]")]
  const maxPage = pageLinks.reduce((max, a) => {
    const href = a.getAttribute("href")
    if (!href) return max
    const page = new URL(href, BASE_URL).searchParams.get("page")
    const parsed = page ? parseInt(page) : NaN
    return Number.isFinite(parsed) ? Math.max(max, parsed) : max
  }, 1)
  return Math.min(MAX_PAGES, Math.max(1, maxPage))
}

const collectPhotos = (document: LinkedomDocument) =>
  [
    ...new Set(
      [
        document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null,
        ...[...document.querySelectorAll(".dog-preview-image img, .gallery-section img")].map(
          (img) => img.getAttribute("src"),
        ),
      ]
        .filter((src): src is string => !!src)
        .map(toAbsoluteUrl)
        .filter((src) => !src.endsWith(".svg")),
    ),
  ]

export const schroniskoSwidnicaAdapter = createAdapter({
  id: SHELTER_ID,
  name: "Schronisko dla bezdomnych zwierząt w Świdnicy",
  url: BASE_URL,
  sourceUrl: SOURCE_URL,
  city: "Świdnica",

  fetch: (config) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const response = yield* client.get(SOURCE_URL).pipe(Effect.scoped)
      return yield* response.text
    }).pipe(
      Effect.mapError((cause) =>
        new ScrapeError({
          shelterId: config.shelterId,
          cause,
          message: `Failed to fetch ${SOURCE_URL}`,
        })
      )
    ),

  parse: (firstPageHtml, config) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient

      const fetchPageHtml = (url: string) =>
        client.get(url).pipe(Effect.flatMap((res) => res.text), Effect.scoped)

      const { document: firstDoc } = parseHTML(firstPageHtml)
      const maxPage = collectMaxPage(firstDoc)

      const pageUrls = Array.from({ length: maxPage }, (_, i) => {
        const url = new URL("/psy-do-adopcji", BASE_URL)
        url.searchParams.set("page", String(i + 1))
        return url.toString()
      })

      const remainingPages = yield* Effect.all(
        pageUrls.slice(1).map(fetchPageHtml),
        { concurrency: 3 },
      )

      const listDocs = [firstDoc, ...remainingPages.map((html) => parseHTML(html).document)]
      const dogUrls = [
        ...new Set(
          listDocs.flatMap(collectDogDetailUrls),
        ),
      ].slice(0, MAX_DOGS)

      const dogs = yield* Effect.all(
        dogUrls.map((sourceUrl) =>
          Effect.gen(function* () {
            const html = yield* fetchPageHtml(sourceUrl)
            const { document } = parseHTML(html)
            const externalId = new URL(sourceUrl).pathname.split("/").filter(Boolean)[1] ?? sourceUrl

            const name = (
              document.querySelector(".dog-name h1")?.textContent ??
              document.querySelector("h1")?.textContent ??
              "Unknown"
            ).trim()

            const rawDescription = normalizeText(document.querySelector(".description")?.textContent ?? "")
            const sex = parseSex(document.querySelector(".tags")?.textContent ?? "")
            const photos = collectPhotos(document)

            return {
              fingerprint: `${SHELTER_ID}:${externalId}`,
              externalId,
              name,
              rawDescription,
              photos,
              sex,
              sourceUrl,
            } satisfies RawDogData
          }).pipe(Effect.catchAll(() => Effect.succeed(null)))
        ),
        { concurrency: 5 },
      )

      return dogs.filter((dog) => dog !== null) as readonly RawDogData[]
    }).pipe(
      Effect.mapError(
        (cause) =>
          new ParseError({
            shelterId: config.shelterId,
            cause,
            message: "Failed to parse Schronisko Świdnica pages",
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
