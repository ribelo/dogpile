import { Effect, Schema } from "effect"
import { HttpClient } from "@effect/platform"
import { parseHTML } from "linkedom"
import { createAdapter, type RawDogData } from "../adapter.js"
import { ScrapeError, ParseError } from "@dogpile/core"

const SHELTER_ID = "przytulisko-u-wandy"
const BASE_URL = "https://przytuliskauwandy.pl"
const SOURCE_URL = "https://przytuliskauwandy.pl/category/psy/psy-do-adopcji/"

const MAX_PAGES = 5
const PER_PAGE = 100
const MAX_DOGS = 60
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

  const cat = /\bkot(?:ek|ka|ki|ku|ów|y|a|em|ami)?\b/.test(text) || /\bkocur(?:ek|a|em)?\b/.test(text)
  const dog = /\bpies|psiak|suczk|psiaczk|suk|samiec|samiczk|piesek|pieseczek|kundelek|kundelk|czworonożn|psina|piesk\b/.test(text)

  if (cat && !dog) return false
  return true
}

export const extractWandyDogUrlsFromListingHtml = (html: string): string[] => {
  const { document } = parseHTML(html)
  const links = document.querySelectorAll("article a[href]")
  const urls: string[] = []

  for (const link of links) {
    const href = link.getAttribute("href")
    if (!href) continue
    const abs = toAbsoluteUrl(href)
    if (abs && abs.startsWith(BASE_URL) && !abs.includes("/category/")) {
      if (!urls.includes(abs)) urls.push(abs)
    }
  }

  return urls.slice(0, MAX_DOGS)
}

export const parseWandyDogDetailPageHtml = (html: string, sourceUrl: string): RawDogData => {
  const { document } = parseHTML(html)

  const titleEl = document.querySelector("h1.entry-title, .entry-title, article h1, h1")
  const name = decodeHtmlText(titleEl?.textContent ?? "Unknown")

  const postIdMatch = html.match(/postid-(\d+)/) || html.match(/post-(\d+)/)
  const externalId = postIdMatch?.[1] ?? name.toLowerCase().replace(/\s+/g, "-")

  const contentEl = document.querySelector(".entry-content, article .content, article")
  const nodes = contentEl
    ? [...contentEl.querySelectorAll("p, li, h2, h3")].slice(0, MAX_DESCRIPTION_NODES)
    : []
  const descParts = nodes
    .map((n) => n.textContent?.replace(/\s+/g, " ").trim() ?? "")
    .filter((s) => s.length >= 10 && !s.includes("Wirtualni Opiekunowie"))

  const rawDescription = descParts.join("\n").trim() || name

  const photos: string[] = []
  const imgs = document.querySelectorAll("article img, .entry-content img, .gallery img, .nivoSlider img")

  const banned = ["logo", ".svg", "elementor", "gravatar"]

  for (const img of imgs) {
    if (photos.length >= MAX_PHOTOS) break

    const src =
      img.getAttribute("src") ||
      img.getAttribute("data-src") ||
      img.getAttribute("data-lazy-src") ||
      null

    if (src) {
      const abs = toAbsoluteUrl(src)
      if (abs && abs.includes("/wp-content/uploads/")) {
        const cleaned = cleanWpSizedImageUrl(abs)
        const lower = cleaned.toLowerCase()
        if (!banned.some((b) => lower.includes(b)) && /\.(jpe?g|png|webp)$/i.test(lower)) {
          if (!photos.includes(cleaned)) photos.push(cleaned)
        }
      }
    }
  }

  const galleryLinks = document.querySelectorAll("article a[href*='/wp-content/uploads/'], .gallery a[href*='/wp-content/uploads/']")
  for (const a of galleryLinks) {
    if (photos.length >= MAX_PHOTOS) break
    const href = a.getAttribute("href")
    if (href) {
      const abs = toAbsoluteUrl(href)
      if (abs) {
        const cleaned = cleanWpSizedImageUrl(abs)
        const lower = cleaned.toLowerCase()
        if (!banned.some((b) => lower.includes(b)) && /\.(jpe?g|png|webp)$/i.test(lower)) {
          if (!photos.includes(cleaned)) photos.push(cleaned)
        }
      }
    }
  }

  return {
    fingerprint: `${SHELTER_ID}:${externalId}`,
    externalId,
    name,
    rawDescription,
    photos,
    sex: "unknown" as const,
    sourceUrl,
  }
}

export const przytuliskoUWandyAdapter = createAdapter({
  id: SHELTER_ID,
  name: "Przytulisko u Wandy",
  url: BASE_URL,
  sourceUrl: SOURCE_URL,
  city: "Przyborówko",

  fetch: (config) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient

      const categoriesRes = yield* client
        .get(`${BASE_URL}/wp-json/wp/v2/categories?slug=psy-do-adopcji&per_page=5`)
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
        message: "Failed to fetch Przytulisko u Wandy posts",
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
            const { document } = parseFragment(post.content.rendered)
            const plainText = document.body.textContent?.replace(/\s+/g, " ").trim() ?? ""

            if (!isDogPost(titleText, plainText)) return null

            const photos = extractPhotosFromContent(post.content.rendered)

            const nodes = [...document.querySelectorAll("p, li, h2, h3")].slice(0, MAX_DESCRIPTION_NODES)
            const descParts = nodes
              .map((n) => n.textContent?.replace(/\s+/g, " ").trim() ?? "")
              .filter((s) => s.length >= 10 && !s.includes("Wirtualni Opiekunowie"))

            const rawDescription = descParts.join("\n").trim() || decodeHtmlText(post.excerpt.rendered) || titleText

            return {
              fingerprint: `${SHELTER_ID}:${post.id}`,
              externalId: String(post.id),
              name: titleText,
              rawDescription,
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
        message: "Failed to parse Przytulisko u Wandy posts",
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

const extractPhotosFromContent = (contentHtml: string): string[] => {
  const { document } = parseFragment(contentHtml)
  const photos: string[] = []
  const banned = ["logo", ".svg", "elementor", "gravatar"]

  const imgs = document.querySelectorAll("img")
  for (const img of imgs) {
    if (photos.length >= MAX_PHOTOS) break
    const src =
      img.getAttribute("src") ||
      img.getAttribute("data-src") ||
      img.getAttribute("data-lazy-src") ||
      null
    if (src) {
      const abs = toAbsoluteUrl(src)
      if (abs && abs.includes("/wp-content/uploads/")) {
        const cleaned = cleanWpSizedImageUrl(abs)
        const lower = cleaned.toLowerCase()
        if (!banned.some((b) => lower.includes(b)) && /\.(jpe?g|png|webp)$/i.test(lower)) {
          if (!photos.includes(cleaned)) photos.push(cleaned)
        }
      }
    }
  }

  const galleryLinks = document.querySelectorAll("a[href*='/wp-content/uploads/']")
  for (const a of galleryLinks) {
    if (photos.length >= MAX_PHOTOS) break
    const href = a.getAttribute("href")
    if (href) {
      const abs = toAbsoluteUrl(href)
      if (abs) {
        const cleaned = cleanWpSizedImageUrl(abs)
        const lower = cleaned.toLowerCase()
        if (!banned.some((b) => lower.includes(b)) && /\.(jpe?g|png|webp)$/i.test(lower)) {
          if (!photos.includes(cleaned)) photos.push(cleaned)
        }
      }
    }
  }

  return photos
}
