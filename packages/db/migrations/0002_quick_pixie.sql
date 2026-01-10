CREATE TABLE `api_costs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`operation` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `api_costs_created_at_idx` ON `api_costs` (`created_at`);--> statement-breakpoint
CREATE INDEX `api_costs_operation_idx` ON `api_costs` (`operation`);--> statement-breakpoint
CREATE INDEX `api_costs_model_idx` ON `api_costs` (`model`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_dogs` (
	`id` text PRIMARY KEY NOT NULL,
	`shelter_id` text NOT NULL,
	`external_id` text NOT NULL,
	`name` text NOT NULL,
	`sex` text,
	`location_name` text,
	`location_city` text,
	`location_lat` real,
	`location_lng` real,
	`is_foster` integer,
	`breed_estimates` text DEFAULT '[]' NOT NULL,
	`size_estimate` text,
	`age_estimate` text,
	`weight_estimate` text,
	`personality_tags` text DEFAULT '[]' NOT NULL,
	`vaccinated` integer,
	`sterilized` integer,
	`chipped` integer,
	`good_with_kids` integer,
	`good_with_dogs` integer,
	`good_with_cats` integer,
	`fur_length` text,
	`fur_type` text,
	`color_primary` text,
	`color_secondary` text,
	`color_pattern` text,
	`ear_type` text,
	`tail_type` text,
	`photos` text DEFAULT '[]' NOT NULL,
	`photos_generated` text DEFAULT '[]' NOT NULL,
	`source_url` text,
	`urgent` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`fingerprint` text NOT NULL,
	`raw_description` text,
	`generated_bio` text,
	`last_seen_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`shelter_id`) REFERENCES `shelters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_dogs`("id", "shelter_id", "external_id", "name", "sex", "location_name", "location_city", "location_lat", "location_lng", "is_foster", "breed_estimates", "size_estimate", "age_estimate", "weight_estimate", "personality_tags", "vaccinated", "sterilized", "chipped", "good_with_kids", "good_with_dogs", "good_with_cats", "fur_length", "fur_type", "color_primary", "color_secondary", "color_pattern", "ear_type", "tail_type", "photos", "photos_generated", "source_url", "urgent", "status", "fingerprint", "raw_description", "generated_bio", "last_seen_at", "created_at", "updated_at") SELECT "id", "shelter_id", "external_id", "name", "sex", "location_name", "location_city", "location_lat", "location_lng", "is_foster", "breed_estimates", "size_estimate", "age_estimate", "weight_estimate", "personality_tags", "vaccinated", "sterilized", "chipped", "good_with_kids", "good_with_dogs", "good_with_cats", "fur_length", "fur_type", "color_primary", "color_secondary", "color_pattern", "ear_type", "tail_type", "photos", "photos_generated", "source_url", "urgent", "status", "fingerprint", "raw_description", "generated_bio", "last_seen_at", "created_at", "updated_at" FROM `dogs`;--> statement-breakpoint
DROP TABLE `dogs`;--> statement-breakpoint
ALTER TABLE `__new_dogs` RENAME TO `dogs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `dogs_fingerprint_unique` ON `dogs` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `dogs_shelter_id_idx` ON `dogs` (`shelter_id`);--> statement-breakpoint
CREATE INDEX `dogs_shelter_external_idx` ON `dogs` (`shelter_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `dogs_status_idx` ON `dogs` (`status`);--> statement-breakpoint
CREATE INDEX `dogs_urgent_idx` ON `dogs` (`urgent`);--> statement-breakpoint
CREATE INDEX `dogs_location_city_idx` ON `dogs` (`location_city`);--> statement-breakpoint
CREATE INDEX `dogs_fingerprint_idx` ON `dogs` (`fingerprint`);