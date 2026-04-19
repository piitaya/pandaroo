-- Drop the `last_seen_*` cache columns from `spools`. Their only consumer
-- stamped scan/adjust history rows with the last AMS slot the spool had been
-- seen in, but the frontend never renders that location (it only shows AMS
-- chips for actual load/unload/print pins). Dead data.
ALTER TABLE `spools` DROP COLUMN `last_seen_printer_serial`;
--> statement-breakpoint
ALTER TABLE `spools` DROP COLUMN `last_seen_ams_id`;
--> statement-breakpoint
ALTER TABLE `spools` DROP COLUMN `last_seen_slot_id`;
