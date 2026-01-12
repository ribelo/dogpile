PRAGMA foreign_keys=OFF;
--> statement-breakpoint
DROP TABLE IF EXISTS `__new_sync_logs`;
--> statement-breakpoint
CREATE TABLE `__new_sync_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`shelter_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`dogs_added` integer DEFAULT 0 NOT NULL,
	`dogs_updated` integer DEFAULT 0 NOT NULL,
	`dogs_removed` integer DEFAULT 0 NOT NULL,
	`errors` text DEFAULT '[]' NOT NULL,
	`error_message` text,
	FOREIGN KEY (`shelter_id`) REFERENCES `shelters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_sync_logs` (
	`id`,
	`shelter_id`,
	`started_at`,
	`finished_at`,
	`dogs_added`,
	`dogs_updated`,
	`dogs_removed`,
	`errors`,
	`error_message`
)
SELECT
	`id`,
	`shelter_id`,
	`started_at`,
	`finished_at`,
	`dogs_added`,
	`dogs_updated`,
	`dogs_removed`,
	`errors`,
	NULL
FROM `sync_logs`;
--> statement-breakpoint
DROP TABLE `sync_logs`;
--> statement-breakpoint
ALTER TABLE `__new_sync_logs` RENAME TO `sync_logs`;
--> statement-breakpoint
CREATE INDEX `sync_logs_shelter_id_idx` ON `sync_logs` (`shelter_id`);
--> statement-breakpoint
CREATE INDEX `sync_logs_started_at_idx` ON `sync_logs` (`started_at`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
