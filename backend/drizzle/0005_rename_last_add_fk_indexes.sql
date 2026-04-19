-- Rename ambiguous `last_*` columns on spools to `last_seen_*`
ALTER TABLE `spools` RENAME COLUMN `last_printer_serial` TO `last_seen_printer_serial`;
--> statement-breakpoint
ALTER TABLE `spools` RENAME COLUMN `last_ams_id` TO `last_seen_ams_id`;
--> statement-breakpoint
ALTER TABLE `spools` RENAME COLUMN `last_slot_id` TO `last_seen_slot_id`;
--> statement-breakpoint

-- Index supporting the default `ORDER BY last_updated DESC` list query
CREATE INDEX `spool_last_updated_idx` ON `spools` (`last_updated`);
--> statement-breakpoint

-- Index supporting "show me errored syncs"
CREATE INDEX `spool_sync_state_error_idx` ON `spool_sync_state` (`last_sync_error`);
--> statement-breakpoint

-- Add FK from spool_history.tag_id → spools.tag_id with ON DELETE CASCADE.
-- SQLite cannot ALTER TABLE to add a constraint, so recreate the table.
-- Clean up any pre-existing orphans first or the new table constraints would
-- be violated the next time foreign_keys enforcement is enabled.
DELETE FROM `spool_history` WHERE `tag_id` NOT IN (SELECT `tag_id` FROM `spools`);
--> statement-breakpoint
CREATE TABLE `__new_spool_history` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `tag_id` text NOT NULL,
  `source` text NOT NULL,
  `kind` text NOT NULL,
  `printer_serial` text,
  `ams_id` integer,
  `slot_id` integer,
  `remain` integer,
  `weight` real,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (`tag_id`) REFERENCES `spools`(`tag_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_spool_history`
  (`id`, `tag_id`, `source`, `kind`, `printer_serial`, `ams_id`, `slot_id`, `remain`, `weight`, `created_at`)
SELECT `id`, `tag_id`, `source`, `kind`, `printer_serial`, `ams_id`, `slot_id`, `remain`, `weight`, `created_at`
FROM `spool_history`;
--> statement-breakpoint
DROP TABLE `spool_history`;
--> statement-breakpoint
ALTER TABLE `__new_spool_history` RENAME TO `spool_history`;
--> statement-breakpoint
CREATE INDEX `spool_history_tag_created_idx` ON `spool_history` (`tag_id`,`created_at`);
