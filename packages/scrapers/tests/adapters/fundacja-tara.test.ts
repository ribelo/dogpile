import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  extractFundacjaTaraDogFromDetailPage,
  extractFundacjaTaraDogUrlsFromListing,
} from "../../src/adapters/fundacja-tara.js"

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, "..", "fixtures", "fundacja-tara", name), "utf8")

describe("fundacja-tara parsing", () => {
  test("extracts dog URLs from listing", () => {
    const urls = extractFundacjaTaraDogUrlsFromListing(fixture("listing.html"))
    expect(urls).toEqual([
      "https://fundacjatara.info/poproszono-nas-o-pomoc-wiec-udostepniamy-4/",
      "https://fundacjatara.info/poproszono-nas-wiec-udostepniamy-3/",
    ])
  })

  test("extracts name/photos/description from detail page", () => {
    const url = "https://fundacjatara.info/poproszono-nas-o-pomoc-wiec-udostepniamy-4/"
    const dog = extractFundacjaTaraDogFromDetailPage(fixture("detail.html"), url)

    expect(dog.externalId).toBe("6156")
    expect(dog.fingerprint).toBe("fundacja-tara:6156")
    expect(dog.name).toBe("Momo")
    expect(dog.rawDescription).toContain("Kontakt w sprawie adopcji")
    expect(dog.rawDescription).toContain("Momo to młoda")
    expect(dog.photos).toEqual([
      "https://fundacjatara.info/wp-content/uploads/2016/12/2375x.jpg",
      "https://fundacjatara.info/wp-content/uploads/2016/12/2376x.jpg",
    ])
    expect(dog.sourceUrl).toBe(url)
  })
})

