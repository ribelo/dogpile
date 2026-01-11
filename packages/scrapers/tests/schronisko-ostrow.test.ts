import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  extractOstrowDogUrlsFromListing,
  extractOstrowDogFromDetailPage,
} from "../src/adapters/schronisko-ostrow.js"

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, "fixtures/schronisko-ostrow", name), "utf-8")

describe("schronisko-ostrow adapter helpers", () => {
  test("extractDogUrlsFromListing returns dog detail URLs", () => {
    const html = fixture("listing.html")
    const urls = extractOstrowDogUrlsFromListing(html)

    expect(urls).toContain("https://schroniskoostrow.pl/bodzio")
    expect(urls).toContain("https://schroniskoostrow.pl/fleczer")
    expect(urls).not.toContain("https://schroniskoostrow.pl/adopcja-psy")
    expect(urls).not.toContain("https://schroniskoostrow.pl/o-nas")
  })

  test("extractDogDetailFromHtml extracts name, description, photos, sourceUrl", () => {
    const html = fixture("detail.html")
    const dog = extractOstrowDogFromDetailPage(html, "https://schroniskoostrow.pl/bodzio")

    expect(dog.name).toBe("Bodzio")
    expect(dog.externalId).toBe("bodzio")
    expect(dog.fingerprint).toBe("schronisko-ostrow:bodzio")
    expect(dog.sex).toBe("unknown")
    expect(dog.sourceUrl).toBe("https://schroniskoostrow.pl/bodzio")
    expect(dog.rawDescription).toContain("delikatnym")
    expect(dog.photos.length).toBeGreaterThan(0)
    expect(dog.photos[0]).toContain("bodzio")
  })
})
