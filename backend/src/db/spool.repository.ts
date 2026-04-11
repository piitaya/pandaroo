import { eq, sql } from "drizzle-orm";
import { spools } from "./schema.js";
import type { AppDatabase } from "./database.js";
import type { Spool } from "../domain/spool.js";

export type SpoolRow = typeof spools.$inferSelect;

export interface SpoolUpsert {
  tagId: string;
  variantId?: string | null;
  material?: string | null;
  product?: string | null;
  colorHex?: string | null;
  weight?: number | null;
  remain?: number | null;
  lastUsed?: string | null;
  lastUpdated?: string;
  firstSeen?: string;
}

export function toSpoolUpsert(
  spool: Spool & { uid: string },
): SpoolUpsert {
  return {
    tagId: spool.uid,
    variantId: spool.variant_id,
    material: spool.material,
    product: spool.product,
    colorHex: spool.color_hex,
    weight: spool.weight,
    remain: spool.remain,
  };
}

export interface SpoolRepository {
  upsert(data: SpoolUpsert): void;
  findByTagId(tagId: string): SpoolRow | undefined;
  list(): SpoolRow[];
}

export function createSpoolRepository(db: AppDatabase): SpoolRepository {
  return {
    upsert(data) {
      db.insert(spools)
        .values({
          tagId: data.tagId,
          variantId: data.variantId,
          material: data.material,
          product: data.product,
          colorHex: data.colorHex,
          weight: data.weight,
          remain: data.remain,
          lastUsed: data.lastUsed,
          lastUpdated: data.lastUpdated,
          firstSeen: data.firstSeen,
        })
        .onConflictDoUpdate({
          target: spools.tagId,
          set: {
            variantId: sql`COALESCE(excluded.variant_id, ${spools.variantId})`,
            material: sql`COALESCE(excluded.material, ${spools.material})`,
            product: sql`COALESCE(excluded.product, ${spools.product})`,
            colorHex: sql`COALESCE(excluded.color_hex, ${spools.colorHex})`,
            weight: sql`COALESCE(excluded.weight, ${spools.weight})`,
            remain: sql`COALESCE(excluded.remain, ${spools.remain})`,
            lastUsed: sql`COALESCE(excluded.last_used, ${spools.lastUsed})`,
            lastUpdated: sql`COALESCE(excluded.last_updated, ${spools.lastUpdated})`,
          },
        })
        .run();
    },

    findByTagId(tagId) {
      return db.select().from(spools).where(eq(spools.tagId, tagId)).get();
    },

    list() {
      return db
        .select()
        .from(spools)
        .orderBy(sql`${spools.lastUpdated} DESC`)
        .all();
    },
  };
}
