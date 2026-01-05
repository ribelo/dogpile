import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core"

// Breed enum values for reference
export const BREED_VALUES = [
  "owczarek_niemiecki", "owczarek_belgijski", "owczarek_podhalanski", "owczarek_szetlandzki",
  "labrador", "golden_retriever", "husky", "malamut", "bernardyn", "nowofundland",
  "dog_niemiecki", "rottweiler", "doberman", "bokser", "amstaf", "pitbull", "cane_corso", "akita",
  "border_collie", "beagle", "cocker_spaniel", "springer_spaniel", "seter", "pointer",
  "buldog", "basenji", "shiba", "chow_chow", "shar_pei", "dalmatynczyk",
  "jamnik", "jack_russell", "fox_terrier", "west_highland_terrier", "yorkshire_terrier",
  "maltanczyk", "shih_tzu", "pekinczyk", "mops", "buldog_francuski", "chihuahua",
  "pomeranian", "cavalier", "bichon", "pudel", "miniatura_schnauzer",
  "gonczy_polski", "ogar_polski", "chart_polski",
  "kundelek", "mieszaniec", "nieznana",
] as const

export const shelters = sqliteTable("shelters", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  city: text("city").notNull(),
  region: text("region"),
  lat: real("lat"),
  lng: real("lng"),
  phone: text("phone"),
  email: text("email"),
  status: text("status", { enum: ["active", "inactive", "error"] }).notNull().default("active"),
  lastSync: integer("last_sync", { mode: "timestamp" }),
}, (table) => [
  index("shelters_slug_idx").on(table.slug),
  index("shelters_status_idx").on(table.status),
])

export const dogs = sqliteTable("dogs", {
  id: text("id").primaryKey(),
  shelterId: text("shelter_id").notNull().references(() => shelters.id, { onDelete: "cascade" }),
  externalId: text("external_id").notNull(),

  // Basic (from text extraction)
  name: text("name").notNull(),
  sex: text("sex", { enum: ["male", "female", "unknown"] }),

  // Location (where dog physically is)
  locationName: text("location_name"),
  locationCity: text("location_city"),
  locationLat: real("location_lat"),
  locationLng: real("location_lng"),
  isFoster: integer("is_foster", { mode: "boolean" }),

  // AI estimations (JSON)
  breedEstimates: text("breed_estimates", { mode: "json" }).$type<{ breed: string; confidence: number }[]>().notNull().default([]),
  sizeEstimate: text("size_estimate", { mode: "json" }).$type<{ value: string; confidence: number } | null>(),
  ageEstimate: text("age_estimate", { mode: "json" }).$type<{ months: number; confidence: number; rangeMin: number; rangeMax: number } | null>(),
  weightEstimate: text("weight_estimate", { mode: "json" }).$type<{ kg: number; confidence: number; rangeMin: number; rangeMax: number } | null>(),

  // AI text extraction
  personalityTags: text("personality_tags", { mode: "json" }).$type<string[]>().notNull().default([]),

  // Health (often missing)
  vaccinated: integer("vaccinated", { mode: "boolean" }),
  sterilized: integer("sterilized", { mode: "boolean" }),
  chipped: integer("chipped", { mode: "boolean" }),

  // Compatibility (often missing)
  goodWithKids: integer("good_with_kids", { mode: "boolean" }),
  goodWithDogs: integer("good_with_dogs", { mode: "boolean" }),
  goodWithCats: integer("good_with_cats", { mode: "boolean" }),

  // AI photo extraction
  furLength: text("fur_length", { enum: ["short", "medium", "long"] }),
  furType: text("fur_type", { enum: ["smooth", "wire", "curly", "double"] }),
  colorPrimary: text("color_primary"),
  colorSecondary: text("color_secondary"),
  colorPattern: text("color_pattern", { enum: ["solid", "spotted", "brindle", "merle", "bicolor", "tricolor", "sable", "tuxedo"] }),
  earType: text("ear_type", { enum: ["floppy", "erect", "semi"] }),
  tailType: text("tail_type", { enum: ["long", "short", "docked", "curled"] }),

  // Photos (R2 keys)
  photos: text("photos", { mode: "json" }).$type<string[]>().notNull().default([]),
  photosGenerated: text("photos_generated", { mode: "json" }).$type<string[]>().notNull().default([]),

  // Meta
  sourceUrl: text("source_url"),
  urgent: integer("urgent", { mode: "boolean" }).notNull().default(false),
  status: text("status", { enum: ["pending", "available", "adopted", "reserved", "removed"] }).notNull().default("pending"),
  fingerprint: text("fingerprint").notNull().unique(),
  rawDescription: text("raw_description"),
  generatedBio: text("generated_bio"),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("dogs_shelter_id_idx").on(table.shelterId),
  index("dogs_shelter_external_idx").on(table.shelterId, table.externalId),
  index("dogs_status_idx").on(table.status),
  index("dogs_urgent_idx").on(table.urgent),
  index("dogs_location_city_idx").on(table.locationCity),
  index("dogs_fingerprint_idx").on(table.fingerprint),
])

export const syncLogs = sqliteTable("sync_logs", {
  id: text("id").primaryKey(),
  shelterId: text("shelter_id").notNull().references(() => shelters.id, { onDelete: "cascade" }),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
  dogsAdded: integer("dogs_added").notNull().default(0),
  dogsUpdated: integer("dogs_updated").notNull().default(0),
  dogsRemoved: integer("dogs_removed").notNull().default(0),
  errors: text("errors", { mode: "json" }).$type<string[]>().notNull().default([]),
}, (table) => [
  index("sync_logs_shelter_id_idx").on(table.shelterId),
  index("sync_logs_started_at_idx").on(table.startedAt),
])
