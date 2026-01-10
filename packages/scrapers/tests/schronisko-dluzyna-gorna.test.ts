import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  extractDogUrlsFromListingHtml,
  parseDogDetailPageHtml,
} from "../src/adapters/schronisko-dluzyna-gorna.js"

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, "fixtures", name), "utf-8")

describe("schronisko-dluzyna-gorna adapter helpers", () => {
  test("extractDogUrlsFromListingHtml returns unique detail URLs", () => {
    const html = fixture("schroniskodg-listing.html")
    expect(extractDogUrlsFromListingHtml(html)).toEqual([
      "https://schroniskodg.pl/zwierzak/kropek/",
      "https://schroniskodg.pl/zwierzak/shrek/",
    ])
  })

  test("parseDogDetailPageHtml extracts name, description, photos, sourceUrl", () => {
    const html = fixture("schroniskodg-kropek.html")
    const dog = parseDogDetailPageHtml(html, "https://schroniskodg.pl/zwierzak/kropek/")

    expect(dog.name).toBe("Kropek")
    expect(dog.externalId).toBe("1582")
    expect(dog.fingerprint).toBe("schronisko-dluzyna-gorna:1582")
    expect(dog.sex).toBe("male")
    expect(dog.sourceUrl).toBe("https://schroniskodg.pl/zwierzak/kropek/")
    expect(dog.rawDescription).toContain("Kropek trafił do nas")
    expect(dog.photos).toEqual([
      "https://schroniskodg.pl/wp-content/uploads/2025/12/kropek5-2.jpg",
      "https://schroniskodg.pl/wp-content/uploads/2025/12/kropek5-1.jpg",
    ])
  })
})

