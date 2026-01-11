import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  extractSkalowoDogUrlsFromListing,
  extractSkalowoDogFromDetailPage,
} from "../../src/adapters/schronisko-skalowo.js"

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, "..", "fixtures", "schronisko-skalowo", name), "utf8")

describe("schronisko-skalowo parsing", () => {
  test("extracts dog URLs from listing", () => {
    const urls = extractSkalowoDogUrlsFromListing(fixture("listing.html"))
    expect(urls).toEqual([
      "https://schronisko-skalowo.pl/psy-do-adopcji/cywil",
      "https://schronisko-skalowo.pl/psy-do-adopcji/saga",
    ])
  })

  test("extracts name/photos/description from detail page", () => {
    const dog = extractSkalowoDogFromDetailPage(
      fixture("detail.html"),
      "https://schronisko-skalowo.pl/psy-do-adopcji/cywil",
    )

    expect(dog.externalId).toBe("cywil")
    expect(dog.fingerprint).toBe("schronisko-skalowo:cywil")
    expect(dog.name).toBe("Cywil")
    expect(dog.rawDescription).toContain("dumny owczarek")
    expect(dog.photos).toEqual([
      "https://schronisko-skalowo.pl/media/djmediatools/cache/392-cywil/768x0-towidth-90-dsc_1544_srednie.jpg",
      "https://schronisko-skalowo.pl/media/djmediatools/cache/392-cywil/1189x0-towidth-90-dsc_1575_srednie.jpg",
    ])
    expect(dog.sex).toBe("male")
    expect(dog.sourceUrl).toBe("https://schronisko-skalowo.pl/psy-do-adopcji/cywil")
  })
})
