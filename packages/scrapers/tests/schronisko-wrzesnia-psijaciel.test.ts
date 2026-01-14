import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  extractWrzesniaPsijacielDogUrlsFromListing,
  extractWrzesniaPsijacielDogFromDetailPage,
} from "../src/adapters/schronisko-wrzesnia-psijaciel.js"

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, "fixtures/schronisko-wrzesnia-psijaciel", name), "utf-8")

describe("schronisko-wrzesnia-psijaciel adapter helpers", () => {
  test("extractDogUrlsFromListing returns dog detail URLs", () => {
    const html = fixture("listing.html")
    const urls = extractWrzesniaPsijacielDogUrlsFromListing(html)

    expect(urls).toContain("https://psi-jaciel.pl/index.php/2025/03/12/jocker-2/")
    expect(urls).toContain("https://psi-jaciel.pl/index.php/2015/09/27/przemek/")
  })

  test("extractDogDetailFromHtml extracts name, description, photos, sourceUrl", () => {
    const html = fixture("detail.html")
    const dog = extractWrzesniaPsijacielDogFromDetailPage(
      html,
      "https://psi-jaciel.pl/index.php/2025/03/12/jocker-2/",
    )

    expect(dog.name).toBe("Jocker")
    expect(dog.externalId).toBe("2025-03-12-jocker-2")
    expect(dog.fingerprint).toBe("schronisko-wrzesnia-psijaciel:2025-03-12-jocker-2")
    expect(dog.sex).toBe("male")
    expect(dog.sourceUrl).toBe("https://psi-jaciel.pl/index.php/2025/03/12/jocker-2/")
    expect(dog.rawDescription).toContain("przyjazny")
    expect(dog.photos.length).toBeGreaterThan(0)
    expect(dog.photos[0]).toContain("wp-content/uploads")
  })

  test("extractDogDetailFromHtml falls back to externalId when h1 is empty/whitespace", () => {
    const html = "<html><body><h1> </h1><div class='entry-content'><p>Opis psa</p></div></body></html>"
    const dog = extractWrzesniaPsijacielDogFromDetailPage(
      html,
      "https://psi-jaciel.pl/index.php/2025/03/12/jocker-2/?utm_source=test#x",
    )

    expect(dog.externalId).toBe("2025-03-12-jocker-2")
    expect(dog.name).toBe("2025-03-12-jocker-2")
    expect(dog.fingerprint).toBe("schronisko-wrzesnia-psijaciel:2025-03-12-jocker-2")
  })
})
