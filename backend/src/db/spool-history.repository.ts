import { and, desc, eq, gte, isNotNull, lt, lte } from "drizzle-orm";
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
  /**
   * Atomic findLatest + conditional insert in one transaction. Prevents two
   * concurrent callers from both observing the same "latest" row and writing
   * duplicate history entries.
   */
  insertIfChanged(
    data: SpoolHistoryInsert,
    shouldInsert: (latest: SpoolHistoryRow | undefined) => boolean,
  ): boolean;
  findById(id: number): SpoolHistoryRow | undefined;
  findLatest(tagId: string): SpoolHistoryRow | undefined;
  findLatestWithRemain(tagId: string): SpoolHistoryRow | undefined;
  list(tagId: string, options: ListHistoryOptions): SpoolHistoryRow[];
  updateRemain(id: number, remain: number | null): boolean;
  deleteById(id: number): boolean;
  deleteByTagId(tagId: string): number;
}

export function createSpoolHistoryRepository(db: AppDatabase): SpoolHistoryRepository {
  const findLatestSync = (tagId: string): SpoolHistoryRow | undefined =>
    db
      .select()
      .from(spoolHistory)
      .where(eq(spoolHistory.tagId, tagId))
      .orderBy(desc(spoolHistory.createdAt), desc(spoolHistory.id))
      .limit(1)
      .get();

  return {
    insert(data) {
      db.insert(spoolHistory).values(data).run();
    },

    insertIfChanged(data, shouldInsert) {
      return db.transaction((tx) => {
        const latest = tx
          .select()
          .from(spoolHistory)
          .where(eq(spoolHistory.tagId, data.tagId))
          .orderBy(desc(spoolHistory.createdAt), desc(spoolHistory.id))
          .limit(1)
          .get();
        if (!shouldInsert(latest)) return false;
        tx.insert(spoolHistory).values(data).run();
        return true;
      });
    },

    findById(id) {
      return db.select().from(spoolHistory).where(eq(spoolHistory.id, id)).get();
    },

    findLatest(tagId) {
      return findLatestSync(tagId);
    },

    findLatestWithRemain(tagId) {
      return db
        .select()
        .from(spoolHistory)
        .where(
          and(
            eq(spoolHistory.tagId, tagId),
            isNotNull(spoolHistory.remain),
          ),
        )
        .orderBy(desc(spoolHistory.createdAt), desc(spoolHistory.id))
        .limit(1)
        .get();
    },

    updateRemain(id, remain) {
      const result = db
        .update(spoolHistory)
        .set({ remain })
        .where(eq(spoolHistory.id, id))
        .run();
      return result.changes > 0;
    },

    deleteById(id) {
      const result = db
        .delete(spoolHistory)
        .where(eq(spoolHistory.id, id))
        .run();
      return result.changes > 0;
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

