ALTER TABLE `shelters` ADD `active` integer DEFAULT true NOT NULL;
--> statement-breakpoint
UPDATE `shelters` SET `active` = false WHERE `status` = 'inactive';
