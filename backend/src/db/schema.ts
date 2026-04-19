import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const spools = sqliteTable(
  "spools",
  {
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
    // `last_seen_*` reflects the most recent observation, not where the spool
    // is right now. For current location, consult the live printer pool.
    lastUsed: text("last_used"),
    lastSeenPrinterSerial: text("last_seen_printer_serial"),
    lastSeenAmsId: integer("last_seen_ams_id"),
    lastSeenSlotId: integer("last_seen_slot_id"),
    firstSeen: text("first_seen")
      .notNull()
      .default(sql`(datetime('now'))`),
    lastUpdated: text("last_updated")
      .notNull()
      .default(sql`(datetime('now'))`)
      .$onUpdate(() => new Date().toISOString()),
  },
  (t) => ({
    lastUpdatedIdx: index("spool_last_updated_idx").on(t.lastUpdated),
  }),
);

export const spoolSyncState = sqliteTable(
  "spool_sync_state",
  {
    tagId: text("tag_id")
      .primaryKey()
      .references(() => spools.tagId, { onDelete: "cascade" }),
    spoolmanSpoolId: integer("spoolman_spool_id"),
    lastSynced: text("last_synced"),
    lastSyncError: text("last_sync_error"),
  },
  (t) => ({
    errorIdx: index("spool_sync_state_error_idx").on(t.lastSyncError),
  }),
);

export const spoolHistory = sqliteTable(
  "spool_history",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    tagId: text("tag_id")
      .notNull()
      .references(() => spools.tagId, { onDelete: "cascade" }),
    eventType: text("event_type", {
      enum: ["ams_load", "ams_unload", "ams_update", "scan", "adjust"],
    }).notNull(),
    printerSerial: text("printer_serial"),
    amsId: integer("ams_id"),
    slotId: integer("slot_id"),
    remain: integer(),
    weight: real(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    tagCreatedIdx: index("spool_history_tag_created_idx").on(t.tagId, t.createdAt),
  }),
);
