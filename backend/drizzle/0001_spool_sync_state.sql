CREATE TABLE `spool_sync_state` (
	`tag_id` text PRIMARY KEY NOT NULL,
	`spoolman_spool_id` integer,
	`last_synced` text,
	`last_sync_error` text,
	FOREIGN KEY (`tag_id`) REFERENCES `spools`(`tag_id`) ON UPDATE no action ON DELETE cascade
);
