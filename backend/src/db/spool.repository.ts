import { eq, sql } from "drizzle-orm";
import { spools } from "./schema.js";
import type { AppDatabase } from "./database.js";

export type SpoolRow = typeof spools.$inferSelect;
export type SpoolInsert = typeof spools.$inferInsert;

export interface SpoolRepository {
  create(data: SpoolInsert): void;
  update(tagId: string, data: Partial<Omit<SpoolInsert, "tagId">>): void;
  delete(tagId: string): boolean;
  findByTagId(tagId: string): SpoolRow | undefined;
  list(): SpoolRow[];
}

export function createSpoolRepository(db: AppDatabase): SpoolRepository {
  return {
    create(data) {
      db.insert(spools).values(data).run();
    },

    update(tagId, data) {
      db.update(spools).set(data).where(eq(spools.tagId, tagId)).run();
    },

    delete(tagId) {
      const result = db.delete(spools).where(eq(spools.tagId, tagId)).run();
      return result.changes > 0;
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
