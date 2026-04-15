CREATE TABLE `spool_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tag_id` text NOT NULL,
	`source` text NOT NULL,
	`kind` text NOT NULL,
	`printer_serial` text,
	`ams_id` integer,
	`slot_id` integer,
	`remain` integer,
	`weight` real,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `spool_history_tag_created_idx` ON `spool_history` (`tag_id`,`created_at`);