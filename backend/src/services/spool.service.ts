import type { SpoolData, Spool, SyncState, FilamentEntry } from "@bambu-spoolman-sync/shared";
import type { SpoolRepository, SpoolRow } from "../db/spool.repository.js";
import type { SyncStateRepository, SpoolSyncStateRow } from "../db/sync-state.repository.js";
import type { Mapping } from "../mapping.js";
import { matchSpool } from "../mapping.js";
import type { AppEventBus } from "../events.js";

function hasUid(data: SpoolData): data is SpoolData & { uid: string } {
  return !!data.uid;
}

export function deriveSyncState(
  spoolRow: SpoolRow | undefined,
  syncRow: SpoolSyncStateRow | undefined,
): SyncState {
  if (!syncRow) return { status: "never" };
  if (syncRow.lastSyncError) return { status: "error", error: syncRow.lastSyncError };
  if (syncRow.lastSynced == null || syncRow.spoolmanSpoolId == null) return { status: "never" };

  const lastUpdated = spoolRow?.lastUpdated;
  const isStale = lastUpdated != null && lastUpdated > syncRow.lastSynced;
  return {
    status: isStale ? "stale" : "synced",
    spoolman_spool_id: syncRow.spoolmanSpoolId,
    at: syncRow.lastSynced,
  };
}

function enrichSpool(
  row: SpoolRow,
  syncRow: SpoolSyncStateRow | undefined,
  mapping: Map<string, FilamentEntry>,
): Spool {
  const match = matchSpool(
    { variant_id: row.variantId, material: row.material, product: row.product },
    mapping,
  );
  return {
    tag_id: row.tagId,
    variant_id: row.variantId,
    match_type: match.type,
    material: row.material,
    product: row.product,
    color_hex: row.colorHex,
    color_name: match.entry?.color_name ?? null,
    weight: row.weight,
    remain: row.remain,
    last_used: row.lastUsed,
    first_seen: row.firstSeen,
    last_updated: row.lastUpdated,
    sync: deriveSyncState(row, syncRow),
  };
}

export interface SpoolService {
  list(): Spool[];
  findByTagId(tagId: string): Spool | undefined;
  getSyncState(tagId: string): SyncState;
  listSyncStates(): Map<string, SyncState>;
  delete(tagId: string): boolean;
  listTagIds(): string[];
  upsert(data: SpoolData, options?: { lastUsed?: string }): void;
}

export function createSpoolService(
  spoolRepo: SpoolRepository,
  syncStateRepo: SyncStateRepository,
  mapping: Mapping,
  bus: AppEventBus,
): SpoolService {
  return {
    list() {
      const rows = spoolRepo.list();
      const syncByTagId = new Map(
        syncStateRepo.listAll().map((row) => [row.tagId, row]),
      );
      return rows.map((row) =>
        enrichSpool(row, syncByTagId.get(row.tagId), mapping.byId),
      );
    },

    findByTagId(tagId) {
      const row = spoolRepo.findByTagId(tagId);
      if (!row) return undefined;
      const syncRow = syncStateRepo.findByTagId(tagId);
      return enrichSpool(row, syncRow, mapping.byId);
    },

    getSyncState(tagId) {
      const spoolRow = spoolRepo.findByTagId(tagId);
      const syncRow = syncStateRepo.findByTagId(tagId);
      return deriveSyncState(spoolRow, syncRow);
    },

    listSyncStates() {
      const spoolRows = new Map(spoolRepo.list().map((r) => [r.tagId, r]));
      const syncRows = new Map(syncStateRepo.listAll().map((r) => [r.tagId, r]));
      const result = new Map<string, SyncState>();
      for (const [tagId, spoolRow] of spoolRows) {
        result.set(tagId, deriveSyncState(spoolRow, syncRows.get(tagId)));
      }
      return result;
    },

    delete(tagId) {
      return spoolRepo.delete(tagId);
    },

    listTagIds() {
      return spoolRepo.list().map((row) => row.tagId);
    },

    upsert(data, options) {
      if (!hasUid(data)) return;
      const now = new Date().toISOString();
      const existing = spoolRepo.findByTagId(data.uid);

      if (existing) {
        spoolRepo.update(data.uid, {
          variantId: data.variant_id ?? existing.variantId,
          material: data.material ?? existing.material,
          product: data.product ?? existing.product,
          colorHex: data.color_hex ?? existing.colorHex,
          weight: data.weight ?? existing.weight,
          remain: data.remain ?? existing.remain,
          lastUsed: options?.lastUsed ?? existing.lastUsed,
          lastUpdated: now,
        });
      } else {
        spoolRepo.create({
          tagId: data.uid,
          variantId: data.variant_id,
          material: data.material,
          product: data.product,
          colorHex: data.color_hex,
          weight: data.weight,
          remain: data.remain,
          lastUsed: options?.lastUsed,
          lastUpdated: now,
          firstSeen: now,
        });
      }

      bus.emit("spool:changed", data.uid);
    },
  };
}
