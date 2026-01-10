import { Effect, Schema } from "effect"
import { HttpClient } from "@effect/platform"
import { parseHTML } from "linkedom"
import { createAdapter, type RawDogData } from "../adapter.js"
import { ScrapeError, ParseError } from "@dogpile/core"

const SHELTER_ID = "fundacja-kubusia-puchatka"
const BASE_URL = "https://fundacjakubusiapuchatka.pl"
const SOURCE_URL = "https://fundacjakubusiapuchatka.pl/category/szukaja-domu/"

const MAX_PAGES = 3
const PER_PAGE = 100
const MAX_DOGS = 50
const MAX_PHOTOS = 20
const MAX_DESCRIPTION_NODES = 80

const WpCategory = Schema.Struct({
  id: Schema.Number,
})

const WpCategoryList = Schema.Array(WpCategory)

const WpPostListItem = Schema.Struct({
  id: Schema.Number,
  link: Schema.String,
  title: Schema.Struct({
    rendered: Schema.String,
  }),
})

const WpPostList = Schema.Array(WpPostListItem)

const WpPost = Schema.Struct({
  id: Schema.Number,
  link: Schema.String,
  slug: Schema.String,
  title: Schema.Struct({
    rendered: Schema.String,
  }),
  excerpt: Schema.Struct({
    rendered: Schema.String,
  }),
  content: Schema.Struct({
    rendered: Schema.String,
  }),
  yoast_head_json: Schema.optional(
    Schema.Struct({
      og_description: Schema.optional(Schema.String),
      og_image: Schema.optional(
        Schema.Array(
          Schema.Struct({
            url: Schema.String,
          }),
        ),
      ),
    }),
  ),
})

const parseFragment = (html: string) =>
  parseHTML(`<html><body>${html}</body></html>`)

const decodeHtmlText = (html: string): string => {
  const { document } = parseFragment(html)
  return document.body.textContent?.replace(/\s+/g, " ").trim() ?? ""
}

const cleanWpSizedImageUrl = (url: string): string =>
  url.replace(/-\d+x\d+(\.[a-z0-9]+)$/i, "$1")

const toAbsoluteUrl = (url: string): string | null => {
  if (!url) return null
  if (url.startsWith("data:")) return null
  try {
    const u = new URL(url, BASE_URL)
    u.hash = ""
    return u.toString()
  } catch {
    return null
  }
}

const isDogPost = (title: string, contentText: string): boolean => {
  const text = `${title}\n${contentText}`.toLowerCase()

  const cat = /\bkot(?:ek|ka|ki|ku|ów|y|a|em|ami)?\b/.test(text) || /\bkocur(?:ek|y|a|em|ami)?\b/.test(text)
  const dog =
    /\bpies(?:ek|ki|ka|ku|ów|y|a|em|ami)?\b/.test(text) ||
    /\bpsin(?:ka|ki|ek|y|a|em|ami)?\b/.test(text) ||
    /\bpsiak(?:i|a|em|ami)?\b/.test(text) ||
    /\bsucz(?:ka|ki|ek|y|a|em|ami)?\b/.test(text)

  if (dog) return true
  if (cat) return false
  return true
}

const guessDogNameFromUrl = (sourceUrl: string): string | null => {
  try {
    const url = new URL(sourceUrl)
    const slug = url.pathname.split("/").filter(Boolean).at(-1) ?? ""
    if (!slug) return null
    const withoutNumberSuffix = slug.replace(/-\d+$/, "")
    const parts = withoutNumberSuffix.split("-").filter(Boolean)
    const raw = parts[0] ?? ""
    const cleaned = raw.replace(/[^\p{L}]+/gu, "").trim()
    if (!cleaned) return null
    return cleaned[0]!.toUpperCase() + cleaned.slice(1)
  } catch {
    return null
  }
}

const capitalizeFromSlug = (slug: string): string | null => {
  const withoutNumberSuffix = slug.replace(/-\d+$/, "")
  const first = withoutNumberSuffix.split("-").filter(Boolean)[0] ?? ""
  const cleaned = first.replace(/[^\p{L}]+/gu, "").trim()
  if (!cleaned) return null
  return cleaned[0]!.toUpperCase() + cleaned.slice(1)
}

const guessDogName = (titleText: string): string => {
  const title = titleText.replace(/\s+/g, " ").trim()
  if (!title) return "Unknown"
  const lower = title.toLowerCase()
  const markerIndex = lower.indexOf("szuka domu")
  const beforeMarker = markerIndex >= 0 ? title.slice(0, markerIndex) : title
  const beforeComma = beforeMarker.includes(",") ? beforeMarker.split(",")[0] : beforeMarker
  const cleaned = beforeComma.replace(/[!?.:\u2013-]+$/g, "").trim()
  const matches = cleaned.match(/[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-]+/g)
  if (matches?.at(-1)) return matches.at(-1)!
  const firstToken = cleaned.split(/\s+/)[0]?.trim()
  return firstToken ? firstToken : "Unknown"
}

const extractDescription = (contentHtml: string): { text: string; plainText: string } => {
  const { document } = parseFragment(contentHtml)

  const nodes = [...document.querySelectorAll("p, li, h2, h3")].slice(0, MAX_DESCRIPTION_NODES)
  const parts = nodes
    .map((n) => n.textContent?.replace(/\s+/g, " ").trim() ?? "")
    .filter((s) => s.length >= 10)

  const text = parts.join("\n").trim()
  const plainText = document.body.textContent?.replace(/\s+/g, " ").trim() ?? ""

  return { text, plainText }
}

const extractPhotos = (contentHtml: string, yoastOgImages: readonly string[]): string[] => {
  const { document } = parseFragment(contentHtml)

  const candidates: string[] = []

  for (const img of yoastOgImages) {
    const abs = toAbsoluteUrl(img)
    if (abs) candidates.push(cleanWpSizedImageUrl(abs))
  }

  const imgs: Array<{ getAttribute: (name: string) => string | null }> = [
    ...document.querySelectorAll("img"),
  ].slice(0, 120)
  for (const img of imgs) {
    const src =
      img.getAttribute("src") ||
      img.getAttribute("data-src") ||
      img.getAttribute("data-lazy-src") ||
      null

    if (src) {
      const abs = toAbsoluteUrl(src)
      if (abs && abs.includes("/wp-content/uploads/")) candidates.push(cleanWpSizedImageUrl(abs))
    }

    const srcset = img.getAttribute("srcset")
    if (srcset) {
      const parts = srcset.split(",").map((part) => part.trim()).filter(Boolean)
      const last = parts.at(-1)
      const candidateUrl = last ? last.split(/\s+/)[0] : null
      const abs = candidateUrl ? toAbsoluteUrl(candidateUrl) : null
      if (abs && abs.includes("/wp-content/uploads/")) candidates.push(cleanWpSizedImageUrl(abs))
    }
  }

  const banned = ["fundacjalogo", "logo", "/elementor/", ".svg"]
  const unique: string[] = []

  for (const u of candidates) {
    if (unique.length >= MAX_PHOTOS) break
    const lower = u.toLowerCase()
    if (banned.some((b) => lower.includes(b))) continue
    if (!/\.(?:jpe?g|png|webp)$/i.test(lower)) continue
    if (!unique.includes(u)) unique.push(u)
  }

  return unique
}

export const fundacjaKubusiaPuchatkaAdapter = createAdapter({
  id: SHELTER_ID,
  name: "Fundacja Kubusia Puchatka",
  url: BASE_URL,
  sourceUrl: SOURCE_URL,
  city: "Strzelin",

  fetch: (config) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient

      const categoriesRes = yield* client
        .get(`${BASE_URL}/wp-json/wp/v2/categories?slug=szukaja-domu&per_page=5`)
        .pipe(Effect.scoped)
      const categoriesJson = yield* categoriesRes.text
      const categoriesData = yield* Effect.try({
        try: () => JSON.parse(categoriesJson),
        catch: (cause) => new ScrapeError({
          shelterId: config.shelterId,
          cause,
          message: "Invalid JSON from WordPress categories",
        }),
      })

      const categories = yield* Schema.decodeUnknown(WpCategoryList)(categoriesData).pipe(
        Effect.mapError((cause) => new ScrapeError({
          shelterId: config.shelterId,
          cause,
          message: "Failed to decode WordPress categories",
        })),
      )

      const categoryId = categories[0]?.id
      if (!categoryId) return JSON.stringify([])

      const posts: Array<{ id: number; link: string; title: { rendered: string } }> = []

      for (let page = 1; page <= MAX_PAGES; page++) {
        const url = `${BASE_URL}/wp-json/wp/v2/posts?categories=${categoryId}&per_page=${PER_PAGE}&page=${page}&orderby=date&order=desc`
        const res = yield* client.get(url).pipe(Effect.scoped)
        const json = yield* res.text

        const data = yield* Effect.try({
          try: () => JSON.parse(json),
          catch: (cause) => new ScrapeError({
            shelterId: config.shelterId,
            cause,
            message: `Invalid JSON from ${url}`,
          }),
        })

        const pagePosts = yield* Schema.decodeUnknown(WpPostList)(data).pipe(
          Effect.mapError((cause) => new ScrapeError({
            shelterId: config.shelterId,
            cause,
            message: `Failed to decode posts from ${url}`,
          })),
        )

        if (pagePosts.length === 0) break
        posts.push(...pagePosts)
        if (pagePosts.length < PER_PAGE) break
      }

      const unique = [
        ...new Map(posts.map((p) => [p.id, { id: p.id, url: p.link, title: p.title.rendered }])).values(),
      ]

      return JSON.stringify(unique)
    }).pipe(
      Effect.mapError((cause) => new ScrapeError({
        shelterId: config.shelterId,
        cause,
        message: "Failed to fetch Fundacja Kubusia Puchatka posts",
      })),
    ),

  parse: (json, config) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient

      const list = yield* Effect.try({
        try: () => JSON.parse(json) as unknown,
        catch: (cause) => new ParseError({
          shelterId: config.shelterId,
          cause,
          message: "Invalid JSON from fetch()",
        }),
      })

      const items = yield* Schema.decodeUnknown(
        Schema.Array(
          Schema.Struct({
            id: Schema.Number,
            url: Schema.String,
            title: Schema.String,
          }),
        ),
      )(list).pipe(
        Effect.mapError((cause) => new ParseError({
          shelterId: config.shelterId,
          cause,
          message: "Failed to decode post list",
        })),
      )

      const limited = items.slice(0, MAX_DOGS)

      const dogs = yield* Effect.all(
        limited.map((item) =>
          Effect.gen(function* () {
            const postRes = yield* client
              .get(`${BASE_URL}/wp-json/wp/v2/posts/${item.id}`)
              .pipe(Effect.scoped)
            const postJson = yield* postRes.text

            const postData = yield* Effect.try({
              try: () => JSON.parse(postJson),
              catch: (cause) => new ParseError({
                shelterId: config.shelterId,
                cause,
                message: `Invalid JSON for post ${item.id}`,
              }),
            })

            const post = yield* Schema.decodeUnknown(WpPost)(postData).pipe(
              Effect.mapError((cause) => new ParseError({
                shelterId: config.shelterId,
                cause,
                message: `Failed to decode post ${item.id}`,
              })),
            )

            const titleText = decodeHtmlText(post.title.rendered)
            const { text: rawDescription, plainText } = extractDescription(post.content.rendered)

            if (!isDogPost(titleText, plainText)) return null

            const yoastOgImages = (post.yoast_head_json?.og_image ?? []).map((i) => i.url)
            const photos = extractPhotos(post.content.rendered, yoastOgImages)

            return {
              fingerprint: `${SHELTER_ID}:${post.id}`,
              externalId: String(post.id),
              name: (() => {
                const guessed = guessDogName(titleText)
                if (guessed !== "Unknown") return guessed
                const fromUrl = guessDogNameFromUrl(item.url || post.link)
                if (fromUrl) return fromUrl
                const fromSlug = capitalizeFromSlug(post.slug)
                return fromSlug ?? "Unknown"
              })(),
              rawDescription: rawDescription || decodeHtmlText(post.excerpt.rendered) || titleText,
              photos,
              sex: "unknown" as const,
              sourceUrl: item.url || post.link,
            } satisfies RawDogData
          }).pipe(Effect.catchAll(() => Effect.succeed(null))),
        ),
        { concurrency: 5 },
      )

      return dogs.filter((d) => d !== null) as RawDogData[]
    }).pipe(
      Effect.mapError((cause) => new ParseError({
        shelterId: config.shelterId,
        cause,
        message: "Failed to parse Fundacja Kubusia Puchatka posts",
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
