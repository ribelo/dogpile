import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  extractWolsztynDogUrlsFromListing,
  extractWolsztynDogFromDetailPage,
} from "../src/adapters/przytulisko-wolsztyn.js"

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, "fixtures/przytulisko-wolsztyn", name), "utf-8")

describe("przytulisko-wolsztyn adapter helpers", () => {
  test("extractDogUrlsFromListing returns dog detail URLs", () => {
    const html = fixture("listing.html")
    const urls = extractWolsztynDogUrlsFromListing(html)

    expect(urls.length).toBe(2)
    expect(urls[0]).toContain("do=szczegoly")
    expect(urls[0]).toContain("id=3678")
    expect(urls[1]).toContain("id=3153")
  })

  test("extractDogDetailFromHtml extracts name, description, photos, sourceUrl", () => {
    const html = fixture("detail.html")
    const dog = extractWolsztynDogFromDetailPage(
      html,
      "https://zwierzaki.wolsztyn.pl/index.php?do=szczegoly&id=3678",
    )

    expect(dog.name).toBe("Oli")
    expect(dog.externalId).toBe("3678")
    expect(dog.fingerprint).toBe("przytulisko-wolsztyn:3678")
    expect(dog.sex).toBe("male")
    expect(dog.sourceUrl).toBe("https://zwierzaki.wolsztyn.pl/index.php?do=szczegoly&id=3678")
    expect(dog.rawDescription).toContain("szuka domu")
    expect(dog.photos.length).toBeGreaterThan(0)
  })
})
