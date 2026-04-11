import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const spools = sqliteTable("spools", {
  tagId: text("tag_id").primaryKey(),
  variantId: text("variant_id"),
  material: text(),
  product: text(),
  colorHex: text("color_hex"),
  weight: real(),
  remain: integer(),
  lastUsed: text("last_used"),
  firstSeen: text("first_seen")
    .notNull()
    .default(sql`(datetime('now'))`),
  lastUpdated: text("last_updated")
    .notNull()
    .default(sql`(datetime('now'))`),
});
