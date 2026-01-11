import { Effect } from "effect"
import { HttpClient } from "@effect/platform"
import { parseHTML } from "linkedom"
import { createAdapter, type RawDogData } from "../adapter.js"
import { ScrapeError, ParseError } from "@dogpile/core"

const SHELTER_ID = "schronisko-gniezno"
const PLATFORM_URL = "https://puszatek.pl"
const SOURCE_URL = `${PLATFORM_URL}/schronisko/317`
const OFFICIAL_URL = "https://urbis.gniezno.pl/schronisko/"

const MAX_DOG_URLS = 200
const MAX_PHOTOS = 20

const toAbsoluteUrl = (href: string): string | null => {
  try {
    const url = new URL(href, PLATFORM_URL)
    url.hash = ""
    return url.toString()
  } catch {
    return null
  }
}

export const extractGnieznoDogUrlsFromListing = (html: string): readonly string[] => {
  const { document } = parseHTML(html)

  const urls = [...document.querySelectorAll('a.stretched-link[href^="/zwierzak/"]')]
    .map((a) => a.getAttribute("href"))
    .filter((href): href is string => typeof href === "string" && href.length > 0)
    .map((href) => toAbsoluteUrl(href))
    .filter((u): u is string => typeof u === "string")

  return [...new Set(urls)].slice(0, MAX_DOG_URLS)
}

const parseSex = (text: string): "male" | "female" | "unknown" => {
  const lower = text.trim().toLowerCase()
  if (lower === "on") return "male"
  if (lower === "ona") return "female"
  return "unknown"
}

export const extractGnieznoDogFromDetailPage = (html: string, url: string): RawDogData => {
  const { document } = parseHTML(html)

  const externalId = new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? url

  const name = document.querySelector("#pet-name-main")?.textContent?.trim() ?? "Unknown"

  const sex = parseSex(document.querySelector("#pet-gender")?.textContent ?? "")

  const descriptionEl =
    document.querySelector("div#pet-description") ??
    document.querySelector("p#pet-description") ??
    document.body

  const descriptionClone = descriptionEl.cloneNode(true)
  for (const el of [
    ...descriptionClone.querySelectorAll("#button-more, #button-less, script, style"),
  ]) el.remove()

  const rawDescriptionLines = String(descriptionClone.textContent ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const rawDescription = rawDescriptionLines.join("\n") || "No description"

  const photoCandidates = [
    document.querySelector("#pet-main-image")?.getAttribute("src"),
    ...[...document.querySelectorAll("#pet-photos img, .swiper-slide img, img.pet-thumb")]
      .map((img) => img.getAttribute("src")),
  ]
    .filter((src): src is string => typeof src === "string" && src.length > 0)
    .map((src) => toAbsoluteUrl(src))
    .filter((u): u is string => typeof u === "string")
    .filter((u) => u.includes("/pictures/pets/"))

  const photos: string[] = []
  for (const u of photoCandidates) {
    if (photos.length >= MAX_PHOTOS) break
    if (!photos.includes(u)) photos.push(u)
  }

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

export const schroniskoGnieznoAdapter = createAdapter({
  id: SHELTER_ID,
  name: "Schronisko dla Bezdomnych Zwierząt w Gnieźnie",
  url: OFFICIAL_URL,
  sourceUrl: SOURCE_URL,
  city: "Gniezno",

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
      })),
    ),

  parse: (html, config) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const dogUrls = extractGnieznoDogUrlsFromListing(html)

      const dogs = yield* Effect.all(
        dogUrls.map((url) =>
          client.get(url).pipe(
            Effect.flatMap((res) => res.text),
            Effect.scoped,
            Effect.map((detailHtml) => extractGnieznoDogFromDetailPage(detailHtml, url)),
            Effect.catchAll(() => Effect.succeed(null)),
          ),
        ),
        { concurrency: 5 },
      )

      return dogs.filter((d) => d !== null) as RawDogData[]
    }).pipe(
      Effect.mapError((cause) => new ParseError({
        shelterId: config.shelterId,
        cause,
        message: "Failed to parse Schronisko Gniezno pages",
      })),
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
