import { Effect, Schema } from "effect"
import { HttpClient } from "@effect/platform"
import { createAdapter, type RawDogData } from "../adapter.js"
import { ScrapeError, ParseError } from "@dogpile/core"

const TozDog = Schema.Struct({
  _id: Schema.String,
  image: Schema.String,
  name: Schema.String,
  sex: Schema.String,
  age: Schema.String,
  description: Schema.String,
  createdAt: Schema.String,
})

const TozResponse = Schema.Struct({
  dogs: Schema.Array(TozDog),
})

const parseAge = (age: string): number | null => {
  const match = age.match(/(\d+)\s*(lat|lata|rok|miesi)/i)
  if (!match) return null
  const num = parseInt(match[1])
  const unit = match[2].toLowerCase()
  if (unit.startsWith("miesi")) return num
  return num * 12
}

const parseSex = (sex: string): "male" | "female" | "unknown" => {
  if (sex.toLowerCase() === "pies") return "male"
  if (sex.toLowerCase() === "suczka") return "female"
  return "unknown"
}

export const tozjaworAdapter = createAdapter({
  id: "tozjawor",
  name: "TOZ Jawor",

  fetch: (config) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const response = yield* client.get("https://api.tozjawor.pl/api/dog").pipe(Effect.scoped)
      return yield* response.text
    }).pipe(
      Effect.mapError((cause) => new ScrapeError({
        shelterId: config.shelterId,
        cause,
        message: "Failed to fetch TOZ Jawor API",
      }))
    ),

  parse: (json, config) =>
    Effect.gen(function* () {
      const data = yield* Effect.try({
        try: () => JSON.parse(json),
        catch: (e) => new ParseError({
          shelterId: config.shelterId,
          cause: e,
          message: "Invalid JSON from TOZ Jawor",
        }),
      })

      const parsed = yield* Schema.decodeUnknown(TozResponse)(data).pipe(
        Effect.mapError((e) => new ParseError({
          shelterId: config.shelterId,
          cause: e,
          message: "Schema validation failed",
        }))
      )

      return parsed.dogs.map((dog): RawDogData => ({
        fingerprint: `tozjawor:${dog._id}`,
        externalId: dog._id,
        name: dog.name,
        sex: parseSex(dog.sex),
        ageMonths: parseAge(dog.age),
        rawDescription: dog.description,
        photos: [`https://api.tozjawor.pl/${dog.image}`],
        urgent: false,
      }))
    }),

  transform: (raw, config) =>
    Effect.succeed({
      shelterId: config.shelterId,
      externalId: raw.externalId,
      fingerprint: raw.fingerprint,
      name: raw.name,
      sex: raw.sex ?? "unknown",
      rawDescription: raw.rawDescription,
      sourceUrl: "https://tozjawor.pl/pets",
      photos: raw.photos ?? [],
    }),
})
