import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  extractLesznoHenrykowoDogUrlsFromListing,
  extractLesznoHenrykowoDogFromDetailPage,
} from "../src/adapters/schronisko-leszno-henrykowo.js"

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, "fixtures/schronisko-leszno-henrykowo", name), "utf-8")

describe("schronisko-leszno-henrykowo adapter helpers", () => {
  test("extractDogUrlsFromListing returns dog detail URLs", () => {
    const html = fixture("listing.html")
    const urls = extractLesznoHenrykowoDogUrlsFromListing(html)

    expect(urls).toContain("https://schronisko.leszno.pl/lunka/")
    expect(urls).toContain("https://schronisko.leszno.pl/kacper/")
    expect(urls).not.toContain("https://schronisko.leszno.pl/category/adopcje/psy-do-adopcji/")
    expect(urls).not.toContain("https://schronisko.leszno.pl/aktualnosci/")
  })

  test("extractDogDetailFromHtml extracts name, description, photos, sourceUrl", () => {
    const html = fixture("detail.html")
    const dog = extractLesznoHenrykowoDogFromDetailPage(html, "https://schronisko.leszno.pl/lunka/")

    expect(dog.name).toBe("LUNKA")
    expect(dog.externalId).toBe("lunka")
    expect(dog.fingerprint).toBe("schronisko-leszno-henrykowo:lunka")
    expect(dog.sex).toBe("female")
    expect(dog.sourceUrl).toBe("https://schronisko.leszno.pl/lunka/")
    expect(dog.rawDescription).toContain("schronisku")
    expect(dog.photos.length).toBeGreaterThan(0)
    expect(dog.photos[0]).toContain("LUNKA")
  })
})
