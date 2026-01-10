import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { isZwierzakiBezdomniakiHomeForPetsCanvaSite } from "../../src/adapters/zwierzakibezdomniaki-homeforpets.js"

const fixture = (name: string) =>
  readFileSync(
    join(import.meta.dir, "..", "fixtures", "zwierzakibezdomniaki-homeforpets", name),
    "utf8",
  )

describe("zwierzakibezdomniaki-homeforpets parsing", () => {
  test("detects Canva website bootstrap", () => {
    expect(isZwierzakiBezdomniakiHomeForPetsCanvaSite(fixture("canva.html"))).toBe(true)
  })
})

