-- Collapse spool_history (source, kind) into a single event_type column.
-- Mapping:
--   (ams, slot_enter) -> ams_load
--   (ams, slot_exit)  -> ams_unload
--   (ams, update)     -> ams_update
--   (scan, update)    -> scan
--   (manual, update)  -> adjust
--
-- SQLite can't drop columns with FK dependencies cleanly on older versions,
-- so recreate the table with the new shape and copy rows through a CASE.

CREATE TABLE `__new_spool_history` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `tag_id` text NOT NULL,
  `event_type` text NOT NULL,
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
  (`id`, `tag_id`, `event_type`, `printer_serial`, `ams_id`, `slot_id`, `remain`, `weight`, `created_at`)
SELECT
  `id`,
  `tag_id`,
  CASE
    WHEN `source` = 'ams' AND `kind` = 'slot_enter' THEN 'ams_load'
    WHEN `source` = 'ams' AND `kind` = 'slot_exit'  THEN 'ams_unload'
    WHEN `source` = 'ams' AND `kind` = 'update'     THEN 'ams_update'
    WHEN `source` = 'scan'                           THEN 'scan'
    WHEN `source` = 'manual'                         THEN 'adjust'
    ELSE 'adjust'
  END AS `event_type`,
  `printer_serial`,
  `ams_id`,
  `slot_id`,
  `remain`,
  `weight`,
  `created_at`
FROM `spool_history`;
--> statement-breakpoint
DROP TABLE `spool_history`;
--> statement-breakpoint
ALTER TABLE `__new_spool_history` RENAME TO `spool_history`;
--> statement-breakpoint
CREATE INDEX `spool_history_tag_created_idx` ON `spool_history` (`tag_id`,`created_at`);
