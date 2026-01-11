import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  extractWandyDogUrlsFromListingHtml,
  parseWandyDogDetailPageHtml,
} from "../src/adapters/przytulisko-u-wandy.js"

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, "fixtures", "przytulisko-u-wandy", name), "utf-8")

describe("przytulisko-u-wandy adapter helpers", () => {
  test("extractDogUrlsFromListingHtml returns unique detail URLs, excludes category links", () => {
    const html = fixture("listing.html")
    const urls = extractWandyDogUrlsFromListingHtml(html)

    expect(urls).toContain("https://przytuliskauwandy.pl/shrek/")
    expect(urls).toContain("https://przytuliskauwandy.pl/migdalek/")
    expect(urls).not.toContain("https://przytuliskauwandy.pl/category/psy/psy-do-adopcji/")
    expect(urls.length).toBe(2)
  })

  test("parseDogDetailPageHtml extracts name, description, photos, sourceUrl", () => {
    const html = fixture("shrek.html")
    const dog = parseWandyDogDetailPageHtml(html, "https://przytuliskauwandy.pl/shrek/")

    expect(dog.name).toBe("Shrek")
    expect(dog.externalId).toBe("12345")
    expect(dog.fingerprint).toBe("przytulisko-u-wandy:12345")
    expect(dog.sex).toBe("unknown")
    expect(dog.sourceUrl).toBe("https://przytuliskauwandy.pl/shrek/")
    expect(dog.rawDescription).toContain("Morze psiego spokoju")
    expect(dog.rawDescription).toContain("spokojnych przechadzkach")
    expect(dog.rawDescription).not.toContain("Wirtualni Opiekunowie")
    expect(dog.photos).toEqual([
      "https://przytuliskauwandy.pl/wp-content/uploads/2020/08/zuza-1182.jpg",
      "https://przytuliskauwandy.pl/wp-content/uploads/2020/08/zuza-1145.jpg",
      "https://przytuliskauwandy.pl/wp-content/uploads/2025/12/z-shrek.jpg",
    ])
  })
})
