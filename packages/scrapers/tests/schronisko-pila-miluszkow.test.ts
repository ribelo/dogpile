import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { extractPilaMiluszkowDogFromDetailPage } from "../src/adapters/schronisko-pila-miluszkow.js"

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, "fixtures/schronisko-pila-miluszkow", name), "utf-8")

describe("schronisko-pila-miluszkow adapter helpers", () => {
  test("extractDogDetailFromHtml extracts name, description, photos, sourceUrl", () => {
    const html = fixture("detail.html")
    const dog = extractPilaMiluszkowDogFromDetailPage(html, "https://schronisko.pila.pl/zwierzeta/35/")

    expect(dog.name).toBe("Iwan")
    expect(dog.externalId).toBe("35")
    expect(dog.fingerprint).toBe("schronisko-pila-miluszkow:35")
    expect(dog.sex).toBe("male")
    expect(dog.sourceUrl).toBe("https://schronisko.pila.pl/zwierzeta/35/")
    expect(dog.rawDescription).toContain("energiczny")
    expect(dog.photos.length).toBeGreaterThan(0)
    expect(dog.photos[0]).toContain("iwan")
  })
})
