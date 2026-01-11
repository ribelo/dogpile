import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  extractPoznanDogUrlsFromListing,
  extractPoznanDogFromDetailPage,
} from "../../src/adapters/schronisko-poznan.js"

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, "..", "fixtures", "schronisko-poznan", name), "utf8")

describe("schronisko-poznan parsing", () => {
  test("extracts dog URLs from listing", () => {
    const urls = extractPoznanDogUrlsFromListing(fixture("listing.html"))
    expect(urls).toEqual([
      "https://schronisko.com/zwierzak/bianka/",
      "https://schronisko.com/zwierzak/bentley/",
    ])
  })

  test("extracts name/photos/description from detail page", () => {
    const dog = extractPoznanDogFromDetailPage(
      fixture("detail.html"),
      "https://schronisko.com/zwierzak/bianka/",
    )

    expect(dog.externalId).toBe("bianka")
    expect(dog.fingerprint).toBe("schronisko-poznan:bianka")
    expect(dog.name).toBe("Bianka")
    expect(dog.rawDescription).toContain("piękna suczka")
    expect(dog.photos).toEqual([
      "https://schronisko.com/wp-content/uploads/2023/10/012200399.jpg",
      "https://schronisko.com/wp-content/uploads/2023/10/012200400.jpg",
    ])
    expect(dog.sex).toBe("female")
    expect(dog.sourceUrl).toBe("https://schronisko.com/zwierzak/bianka/")
  })
})
