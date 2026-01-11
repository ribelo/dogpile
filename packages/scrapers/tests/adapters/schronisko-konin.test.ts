import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  extractKoninDogUrlsFromListing,
  extractKoninDogFromDetailPage,
} from "../../src/adapters/schronisko-konin.js"

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, "..", "fixtures", "schronisko-konin", name), "utf8")

describe("schronisko-konin parsing", () => {
  test("extracts dog URLs from listing", () => {
    const urls = extractKoninDogUrlsFromListing(fixture("listing.html"))
    expect(urls).toEqual([
      "https://www.schroniskokonin.pl/kacik-adopcyjny/785-mufasa",
      "https://www.schroniskokonin.pl/kacik-adopcyjny/786-sonik",
    ])
  })

  test("extracts name/photos/description from detail page", () => {
    const dog = extractKoninDogFromDetailPage(
      fixture("detail.html"),
      "https://www.schroniskokonin.pl/kacik-adopcyjny/785-mufasa",
    )

    expect(dog.externalId).toBe("785")
    expect(dog.fingerprint).toBe("schronisko-konin:785")
    expect(dog.name).toBe("MUFASA")
    expect(dog.rawDescription).toContain("spokojny i opanowany pies")
    expect(dog.photos).toEqual([
      "https://www.schroniskokonin.pl/images/mufasa-main.jpg",
      "https://www.schroniskokonin.pl/images/mufasa-1.jpg",
      "https://www.schroniskokonin.pl/images/mufasa-2.jpg",
    ])
    expect(dog.sourceUrl).toBe("https://www.schroniskokonin.pl/kacik-adopcyjny/785-mufasa")
  })
})
