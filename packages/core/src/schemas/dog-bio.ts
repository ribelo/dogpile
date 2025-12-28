import { Schema } from "effect"

export const DogBioSchema = Schema.Struct({
  bio: Schema.String,
  tone: Schema.Literal("hopeful", "urgent", "gentle")
})

export type DogBio = typeof DogBioSchema.Type
