import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  extractWalbrzychDogUrlsFromListing,
  extractWalbrzychDogFromDetailPage,
} from "../../src/adapters/schronisko-walbrzych.js"

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, "..", "fixtures", "schronisko-walbrzych", name), "utf8")

describe("schronisko-walbrzych parsing", () => {
  test("extracts dog URLs from listing", () => {
    const urls = extractWalbrzychDogUrlsFromListing(fixture("listing.html"))
    expect(urls).toEqual([
      "https://schronisko.walbrzych.pl/portfolio/jumbo-160-25/",
      "https://schronisko.walbrzych.pl/portfolio/hugo-156-25/",
    ])
  })

  test("extracts name/photos/description from detail page", () => {
    const dog = extractWalbrzychDogFromDetailPage(
      fixture("detail.html"),
      "https://schronisko.walbrzych.pl/portfolio/jumbo-160-25/",
    )

    expect(dog.externalId).toBe("8911")
    expect(dog.fingerprint).toBe("schronisko-walbrzych:8911")
    expect(dog.name).toBe("Jumbo")
    expect(dog.rawDescription).toContain("Nr ewidencyjny: 160/25")
    expect(dog.photos).toEqual([
      "https://schronisko.walbrzych.pl/wp-content/uploads/2026/01/1-1-21.jpg",
      "https://schronisko.walbrzych.pl/wp-content/uploads/2026/01/1-1-22.jpg",
    ])
    expect(dog.sourceUrl).toBe("https://schronisko.walbrzych.pl/portfolio/jumbo-160-25/")
  })
})

