import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  extractSompolnoDogUrlsFromListingHtml,
  parseSompolnoDogDetailPageHtml,
} from "../../src/adapters/otoz-sompolno.js"

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, "../fixtures/otoz-sompolno", name), "utf-8")

describe("otoz-sompolno adapter helpers", () => {
  test("extractDogUrlsFromListingHtml returns unique detail URLs", () => {
    const html = fixture("listing.html")
    expect(extractSompolnoDogUrlsFromListingHtml(html)).toEqual([
      "https://otoz.pl/zwierze/raisa/",
      "https://otoz.pl/zwierze/dzager/",
      "https://otoz.pl/zwierze/klaldek/",
    ])
  })

  test("parseDogDetailPageHtml extracts name, description, photos, sourceUrl", () => {
    const html = fixture("raisa.html")
    const dog = parseSompolnoDogDetailPageHtml(html, "https://otoz.pl/zwierze/raisa/")

    expect(dog.name).toBe("Raisa")
    expect(dog.externalId).toBe("raisa")
    expect(dog.fingerprint).toBe("otoz-sompolno:raisa")
    expect(dog.sex).toBe("female")
    expect(dog.sourceUrl).toBe("https://otoz.pl/zwierze/raisa/")
    expect(dog.rawDescription).toContain("Raisa znów w schronisku")
    expect(dog.photos).toContain("https://otoz.pl/wp-content/uploads/2025/10/raisa-photo1.jpg")
    expect(dog.photos).toContain("https://otoz.pl/wp-content/uploads/2025/10/raisa-photo2.jpg")
  })
})
