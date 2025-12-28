import { Schema, JSONSchema } from "effect"

export const toJsonSchema = (schema: Schema.Schema<any, any, any>): object => {
  return JSONSchema.make(schema)
}
