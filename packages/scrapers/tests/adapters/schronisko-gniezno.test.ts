import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  extractGnieznoDogUrlsFromListing,
  extractGnieznoDogFromDetailPage,
} from "../../src/adapters/schronisko-gniezno.js"

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, "..", "fixtures", "schronisko-gniezno", name), "utf8")

describe("schronisko-gniezno parsing", () => {
  test("extracts dog URLs from listing", () => {
    expect(extractGnieznoDogUrlsFromListing(fixture("listing.html"))).toEqual([
      "https://puszatek.pl/zwierzak/138698",
      "https://puszatek.pl/zwierzak/138695",
    ])
  })

  test("extracts name/photos/description from detail page", () => {
    const dog = extractGnieznoDogFromDetailPage(
      fixture("baster.html"),
      "https://puszatek.pl/zwierzak/138698",
    )

    expect(dog.externalId).toBe("138698")
    expect(dog.fingerprint).toBe("schronisko-gniezno:138698")
    expect(dog.name).toBe("Baster")
    expect(dog.rawDescription).toContain("Wyjątkowy psiak")
    expect(dog.photos).toEqual([
      "https://puszatek.pl/pictures/pets/a.jpeg",
      "https://puszatek.pl/pictures/pets/b.jpeg",
    ])
    expect(dog.sex).toBe("male")
    expect(dog.sourceUrl).toBe("https://puszatek.pl/zwierzak/138698")
  })
})

