import { and, desc, eq, gte, lt, lte } from "drizzle-orm";
import { spoolHistory } from "./schema.js";
import type { AppDatabase } from "./database.js";

export type SpoolHistoryRow = typeof spoolHistory.$inferSelect;
export type SpoolHistoryInsert = typeof spoolHistory.$inferInsert;

export interface ListHistoryOptions {
  from?: string;
  to?: string;
  before?: string;
  limit: number;
}

export interface SpoolHistoryRepository {
  insert(data: SpoolHistoryInsert): void;
  findLatest(tagId: string): SpoolHistoryRow | undefined;
  list(tagId: string, options: ListHistoryOptions): SpoolHistoryRow[];
  deleteByTagId(tagId: string): number;
}

export function createSpoolHistoryRepository(db: AppDatabase): SpoolHistoryRepository {
  return {
    insert(data) {
      db.insert(spoolHistory).values(data).run();
    },

    findLatest(tagId) {
      return db
        .select()
        .from(spoolHistory)
        .where(eq(spoolHistory.tagId, tagId))
        .orderBy(desc(spoolHistory.createdAt), desc(spoolHistory.id))
        .limit(1)
        .get();
    },

    list(tagId, { from, to, before, limit }) {
      const conditions = [eq(spoolHistory.tagId, tagId)];
      if (from) conditions.push(gte(spoolHistory.createdAt, from));
      if (to) conditions.push(lte(spoolHistory.createdAt, to));
      if (before) conditions.push(lt(spoolHistory.createdAt, before));

      return db
        .select()
        .from(spoolHistory)
        .where(and(...conditions))
        .orderBy(desc(spoolHistory.createdAt), desc(spoolHistory.id))
        .limit(limit)
        .all();
    },

    deleteByTagId(tagId) {
      const result = db
        .delete(spoolHistory)
        .where(eq(spoolHistory.tagId, tagId))
        .run();
      return result.changes;
    },
  };
}

