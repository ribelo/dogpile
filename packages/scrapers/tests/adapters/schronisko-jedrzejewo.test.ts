import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  extractJedrzejewoDogUrlsFromListing,
  extractJedrzejewoDogFromDetailPage,
} from "../../src/adapters/schronisko-jedrzejewo.js"

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, "..", "fixtures", "schronisko-jedrzejewo", name), "utf8")

describe("schronisko-jedrzejewo parsing", () => {
  test("extracts dog URLs from listing", () => {
    expect(extractJedrzejewoDogUrlsFromListing(fixture("listing.html"))).toEqual([
      "https://www.sioz.pl/DetailsOfTheAnimal.aspx?ShelterID=c07b2b18-a6b4-46bc-9cb5-d33660a36a55&AnimalID=1234",
      "https://www.sioz.pl/DetailsOfTheAnimal.aspx?ShelterID=c07b2b18-a6b4-46bc-9cb5-d33660a36a55&AnimalID=5678",
    ])
  })

  test("extracts name/photos/description from detail page", () => {
    const url =
      "https://www.sioz.pl/DetailsOfTheAnimal.aspx?ShelterID=c07b2b18-a6b4-46bc-9cb5-d33660a36a55&AnimalID=1234"
    const dog = extractJedrzejewoDogFromDetailPage(fixture("detail.html"), url)

    expect(dog.externalId).toBe("1234")
    expect(dog.fingerprint).toBe("schronisko-jedrzejewo:1234")
    expect(dog.name).toBe("REX")
    expect(dog.rawDescription).toContain("Gatunek: Pies")
    expect(dog.photos).toEqual([
      "http://sioz.aspnet.pl/api_v2/GetMedia.ashx?Profile=MediaID&MediaID=abc",
    ])
    expect(dog.sex).toBe("female")
    expect(dog.sourceUrl).toBe(url)
  })
})

