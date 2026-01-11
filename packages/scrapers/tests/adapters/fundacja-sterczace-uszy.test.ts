import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  extractSterczaceUszyDogUrlsFromListingHtml,
  parseSterczaceUszyDogDetailPageHtml,
} from "../../src/adapters/fundacja-sterczace-uszy.js"

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, "../fixtures/fundacja-sterczace-uszy", name), "utf-8")

describe("fundacja-sterczace-uszy adapter helpers", () => {
  test("extractDogUrlsFromListingHtml returns unique detail URLs", () => {
    const html = fixture("listing.html")
    expect(extractSterczaceUszyDogUrlsFromListingHtml(html)).toEqual([
      "https://www.sterczaceuszy.pl/do-adopcji/maui",
      "https://www.sterczaceuszy.pl/do-adopcji/riko",
      "https://www.sterczaceuszy.pl/do-adopcji/chester",
    ])
  })

  test("parseDogDetailPageHtml extracts name, description, photos, sourceUrl", () => {
    const html = fixture("maui.html")
    const dog = parseSterczaceUszyDogDetailPageHtml(html, "https://www.sterczaceuszy.pl/do-adopcji/maui")

    expect(dog.name).toBe("Maui")
    expect(dog.externalId).toBe("maui")
    expect(dog.fingerprint).toBe("fundacja-sterczace-uszy:maui")
    expect(dog.sex).toBe("female")
    expect(dog.sourceUrl).toBe("https://www.sterczaceuszy.pl/do-adopcji/maui")
    expect(dog.rawDescription).toContain("Ta urocza, niespełna roczna sunieczka")
    expect(dog.photos.length).toBeGreaterThan(0)
    expect(dog.photos[0]).toContain("ctfassets")
  })
})
