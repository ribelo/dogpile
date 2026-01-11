import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  extractKrotoszynDogUrlsFromListing,
  extractKrotoszynDogFromDetailPage,
} from "../../src/adapters/schronisko-krotoszyn.js"

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, "..", "fixtures", "schronisko-krotoszyn", name), "utf8")

describe("schronisko-krotoszyn parsing", () => {
  test("extracts dog URLs from listing", () => {
    const urls = extractKrotoszynDogUrlsFromListing(fixture("listing.html"))
    expect(urls).toEqual([
      "https://www.schroniskokrotoszyn.pl/do-adopcji/stefan/",
      "https://www.schroniskokrotoszyn.pl/do-adopcji/elza/",
    ])
  })

  test("extracts name/photos/description from detail page", () => {
    const dog = extractKrotoszynDogFromDetailPage(
      fixture("detail.html"),
      "https://www.schroniskokrotoszyn.pl/do-adopcji/stefan/",
    )

    expect(dog.externalId).toBe("stefan")
    expect(dog.fingerprint).toBe("schronisko-krotoszyn:stefan")
    expect(dog.name).toBe("Stefan")
    expect(dog.rawDescription).toContain("Szukamy domu dla staruszka Stefana")
    expect(dog.photos).toEqual([
      "https://www.schroniskokrotoszyn.pl/3791-2951161400-full-size/Stefcio-(5).webp",
      "https://www.schroniskokrotoszyn.pl/3028-1234567890-full-size/Stefan-(16).webp",
      "https://www.schroniskokrotoszyn.pl/3791-2951161400-large/Stefcio-(5).webp",
      "https://www.schroniskokrotoszyn.pl/3028-1234567890-large/Stefan-(16).webp",
    ])
    expect(dog.sex).toBe("male")
    expect(dog.sourceUrl).toBe("https://www.schroniskokrotoszyn.pl/do-adopcji/stefan/")
  })
})
