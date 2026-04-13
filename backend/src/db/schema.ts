import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const spools = sqliteTable("spools", {
  tagId: text("tag_id").primaryKey(),
  variantId: text("variant_id"),
  material: text(),
  product: text(),
  colorHex: text("color_hex"),
  colorHexes: text("color_hexes"),
  weight: real(),
  remain: integer(),
  tempMin: integer("temp_min"),
  tempMax: integer("temp_max"),
  lastUsed: text("last_used"),
  lastPrinterSerial: text("last_printer_serial"),
  lastAmsId: integer("last_ams_id"),
  lastSlotId: integer("last_slot_id"),
  firstSeen: text("first_seen")
    .notNull()
    .default(sql`(datetime('now'))`),
  lastUpdated: text("last_updated")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const spoolSyncState = sqliteTable("spool_sync_state", {
  tagId: text("tag_id")
    .primaryKey()
    .references(() => spools.tagId, { onDelete: "cascade" }),
  spoolmanSpoolId: integer("spoolman_spool_id"),
  lastSynced: text("last_synced"),
  lastSyncError: text("last_sync_error"),
});
