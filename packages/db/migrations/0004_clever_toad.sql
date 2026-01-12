PRAGMA foreign_keys=OFF;
--> statement-breakpoint
DROP TABLE IF EXISTS `__new_shelters`;
--> statement-breakpoint
CREATE TABLE `__new_shelters` (
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
	`active` integer DEFAULT true NOT NULL,
	`last_sync` integer
);
--> statement-breakpoint
INSERT INTO `__new_shelters` (
	`id`,
	`slug`,
	`name`,
	`url`,
	`city`,
	`region`,
	`lat`,
	`lng`,
	`phone`,
	`email`,
	`status`,
	`active`,
	`last_sync`
)
SELECT
	`id`,
	`slug`,
	`name`,
	`url`,
	`city`,
	`region`,
	`lat`,
	`lng`,
	`phone`,
	`email`,
	`status`,
	CASE WHEN `status` = 'inactive' THEN 0 ELSE 1 END,
	`last_sync`
FROM `shelters`;
--> statement-breakpoint
DROP TABLE `shelters`;
--> statement-breakpoint
ALTER TABLE `__new_shelters` RENAME TO `shelters`;
--> statement-breakpoint
CREATE UNIQUE INDEX `shelters_slug_unique` ON `shelters` (`slug`);
--> statement-breakpoint
CREATE INDEX `shelters_slug_idx` ON `shelters` (`slug`);
--> statement-breakpoint
CREATE INDEX `shelters_status_idx` ON `shelters` (`status`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
