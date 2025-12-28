import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"

export const shelters = sqliteTable("shelters", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  url: text("url").notNull(),
  city: text("city").notNull(),
  region: text("region"),
  scraperId: text("scraper_id").notNull(),
  lastSync: integer("last_sync", { mode: "timestamp" }),
  status: text("status", { enum: ["active", "inactive", "error"] }).notNull().default("active"),
}, (table) => [
  index("shelters_slug_idx").on(table.slug),
  index("shelters_status_idx").on(table.status),
])

export const dogs = sqliteTable("dogs", {
  id: text("id").primaryKey(),
  shelterId: text("shelter_id").notNull().references(() => shelters.id, { onDelete: "cascade" }),
  externalId: text("external_id").notNull(),
  name: text("name").notNull(),
  breed: text("breed"),
  ageMonths: integer("age_months"),
  size: text("size", { enum: ["small", "medium", "large"] }),
  sex: text("sex", { enum: ["male", "female", "unknown"] }).notNull().default("unknown"),
  description: text("description"),
  personalityTags: text("personality_tags", { mode: "json" }).$type<string[]>().notNull().default([]),
  photos: text("photos", { mode: "json" }).$type<string[]>().notNull().default([]),
  status: text("status", { enum: ["available", "adopted", "reserved", "removed"] }).notNull().default("available"),
  urgent: integer("urgent", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  checksum: text("checksum").notNull(),
}, (table) => [
  index("dogs_shelter_id_idx").on(table.shelterId),
  index("dogs_shelter_external_idx").on(table.shelterId, table.externalId),
  index("dogs_status_idx").on(table.status),
  index("dogs_city_idx").on(table.shelterId),
  index("dogs_urgent_idx").on(table.urgent),
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
