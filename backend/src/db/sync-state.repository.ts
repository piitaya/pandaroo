import { eq, sql } from "drizzle-orm";
import { spoolSyncState } from "./schema.js";
import type { AppDatabase } from "./database.js";

export type SpoolSyncStateRow = typeof spoolSyncState.$inferSelect;

export interface SyncStateRepository {
  markSynced(tagId: string, syncedAt: string, spoolmanSpoolId: number): void;
  markError(tagId: string, error: string): void;
  findByTagId(tagId: string): SpoolSyncStateRow | undefined;
  listAll(): SpoolSyncStateRow[];
}

export function createSyncStateRepository(
  db: AppDatabase,
): SyncStateRepository {
  return {
    markSynced(tagId, syncedAt, spoolmanSpoolId) {
      db.insert(spoolSyncState)
        .values({
          tagId,
          spoolmanSpoolId,
          lastSynced: syncedAt,
          lastSyncError: null,
        })
        .onConflictDoUpdate({
          target: spoolSyncState.tagId,
          set: {
            spoolmanSpoolId: sql`excluded.spoolman_spool_id`,
            lastSynced: sql`excluded.last_synced`,
            lastSyncError: sql`NULL`,
          },
        })
        .run();
    },

    markError(tagId, error) {
      db.insert(spoolSyncState)
        .values({
          tagId,
          spoolmanSpoolId: null,
          lastSynced: null,
          lastSyncError: error,
        })
        .onConflictDoUpdate({
          target: spoolSyncState.tagId,
          set: {
            lastSyncError: sql`excluded.last_sync_error`,
          },
        })
        .run();
    },

    findByTagId(tagId) {
      return db
        .select()
        .from(spoolSyncState)
        .where(eq(spoolSyncState.tagId, tagId))
        .get();
    },

    listAll() {
      return db.select().from(spoolSyncState).all();
    },
  };
}
