CREATE TABLE `dogs` (
	`id` text PRIMARY KEY NOT NULL,
	`shelter_id` text NOT NULL,
	`external_id` text NOT NULL,
	`name` text NOT NULL,
	`sex` text,
	`description` text,
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
	`status` text DEFAULT 'available' NOT NULL,
	`fingerprint` text NOT NULL,
	`raw_description` text,
	`generated_bio` text,
	`last_seen_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`shelter_id`) REFERENCES `shelters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dogs_fingerprint_unique` ON `dogs` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `dogs_shelter_id_idx` ON `dogs` (`shelter_id`);--> statement-breakpoint
CREATE INDEX `dogs_shelter_external_idx` ON `dogs` (`shelter_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `dogs_status_idx` ON `dogs` (`status`);--> statement-breakpoint
CREATE INDEX `dogs_urgent_idx` ON `dogs` (`urgent`);--> statement-breakpoint
CREATE INDEX `dogs_location_city_idx` ON `dogs` (`location_city`);--> statement-breakpoint
CREATE INDEX `dogs_fingerprint_idx` ON `dogs` (`fingerprint`);--> statement-breakpoint
CREATE TABLE `shelters` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`city` text NOT NULL,
	`region` text,
	`lat` real,
	`lng` real,
	`phone` text,
	`email` text,
	`status` text DEFAULT 'active' NOT NULL,
	`last_sync` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shelters_slug_unique` ON `shelters` (`slug`);--> statement-breakpoint
CREATE INDEX `shelters_slug_idx` ON `shelters` (`slug`);--> statement-breakpoint
CREATE INDEX `shelters_status_idx` ON `shelters` (`status`);--> statement-breakpoint
CREATE TABLE `sync_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`shelter_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`dogs_added` integer DEFAULT 0 NOT NULL,
	`dogs_updated` integer DEFAULT 0 NOT NULL,
	`dogs_removed` integer DEFAULT 0 NOT NULL,
	`errors` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`shelter_id`) REFERENCES `shelters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sync_logs_shelter_id_idx` ON `sync_logs` (`shelter_id`);--> statement-breakpoint
CREATE INDEX `sync_logs_started_at_idx` ON `sync_logs` (`started_at`);