import type { SpoolReading, Spool, SyncState, CatalogEntry } from "@bambu-spoolman-sync/shared";
import type { SpoolRepository, SpoolRow } from "../db/spool.repository.js";
import type { SyncStateRepository, SpoolSyncStateRow } from "../db/sync-state.repository.js";
import type { Mapping } from "../filament-catalog.js";
import { matchSpool } from "../filament-catalog.js";
import type { FastifyBaseLogger } from "fastify";
import type { AppEventBus, SpoolChangeSet } from "../events.js";

function hasTagId(data: SpoolReading): data is SpoolReading & { tag_id: string } {
  return !!data.tag_id;
}

function isStringArray(arr: unknown[]): arr is string[] {
  return arr.every((v) => typeof v === "string");
}

function parseColorHexes(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && isStringArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function serializeColorHexes(hexes: string[] | null): string | null {
  if (!hexes || hexes.length === 0) return null;
  return JSON.stringify(hexes);
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
  mapping: Map<string, CatalogEntry>,
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
    color_hexes: parseColorHexes(row.colorHexes),
    color_name: match.entry?.color_name ?? null,
    weight: row.weight,
    remain: row.remain,
    temp_min: row.tempMin,
    temp_max: row.tempMax,
    last_used: row.lastUsed,
    first_seen: row.firstSeen,
    last_updated: row.lastUpdated,
    sync: deriveSyncState(row, syncRow),
  };
}

export interface UpsertOptions {
  lastUsed?: string;
  source?: "ams" | "scan";
}

export interface UpsertResult {
  spool: Spool;
  created: boolean;
}

export interface SpoolService {
  list(): Spool[];
  findByTagId(tagId: string): Spool | undefined;
  delete(tagId: string): boolean;
  listTagIds(): string[];
  patch(tagId: string, data: { remain?: number }): Spool | undefined;
  upsert(data: SpoolReading, options?: UpsertOptions): UpsertResult | undefined;
}

export interface SpoolServiceDeps {
  spoolRepo: SpoolRepository;
  syncStateRepo: SyncStateRepository;
  mapping: Mapping;
  bus: AppEventBus;
  log: FastifyBaseLogger;
}

export function createSpoolService(deps: SpoolServiceDeps): SpoolService {
  const { spoolRepo, syncStateRepo, mapping, bus, log } = deps;

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

    patch(tagId, data) {
      const before = spoolRepo.findByTagId(tagId);
      if (!before) return undefined;
      spoolRepo.update(tagId, data);
      log.info({ tagId, ...data }, "Spool updated manually");
      const changes: SpoolChangeSet = {
        created: false,
        remain: data.remain != null && data.remain !== before.remain,
        lastUsed: false,
      };
      bus.emit("spool:adjusted", tagId);
      bus.emit("spool:updated", tagId, changes);
      const row = spoolRepo.findByTagId(tagId)!;
      const syncRow = syncStateRepo.findByTagId(tagId);
      return enrichSpool(row, syncRow, mapping.byId);
    },

    delete(tagId) {
      const deleted = spoolRepo.delete(tagId);
      if (deleted) log.info({ tagId }, "Spool deleted");
      return deleted;
    },

    listTagIds() {
      return spoolRepo.list().map((row) => row.tagId);
    },

    upsert(data, options) {
      if (!hasTagId(data)) return undefined;
      const existing = spoolRepo.findByTagId(data.tag_id);

      const colorHexes = serializeColorHexes(data.color_hexes);
      const source = options?.source;

      const changes: SpoolChangeSet = {
        created: false,
        remain: false,
        lastUsed: false,
      };

      if (existing) {
        // State fields (remain) are authoritative from AMS — always take the
        // incoming value so a transient null doesn't freeze stale data. NFC
        // scans don't carry remain, so preserve the existing value for scans.
        const remain =
          source === "ams" ? data.remain : (data.remain ?? existing.remain);

        const next = {
          variantId: data.variant_id ?? existing.variantId,
          material: data.material ?? existing.material,
          product: data.product ?? existing.product,
          colorHex: data.color_hex ?? existing.colorHex,
          colorHexes: colorHexes ?? existing.colorHexes,
          weight: data.weight ?? existing.weight,
          remain,
          tempMin: data.temp_min ?? existing.tempMin,
          tempMax: data.temp_max ?? existing.tempMax,
          lastUsed: options?.lastUsed ?? existing.lastUsed,
        };

        changes.remain = next.remain !== existing.remain;
        changes.lastUsed = next.lastUsed !== existing.lastUsed;

        const identityChanged =
          next.variantId !== existing.variantId ||
          next.material !== existing.material ||
          next.product !== existing.product ||
          next.colorHex !== existing.colorHex ||
          next.colorHexes !== existing.colorHexes ||
          next.weight !== existing.weight ||
          next.tempMin !== existing.tempMin ||
          next.tempMax !== existing.tempMax;

        if (!identityChanged && !changes.remain && !changes.lastUsed) {
          if (source === "scan") bus.emit("spool:scanned", data.tag_id);
          const syncRow = syncStateRepo.findByTagId(data.tag_id);
          return { spool: enrichSpool(existing, syncRow, mapping.byId), created: false };
        }

        // lastUpdated is auto-bumped by the Drizzle $onUpdate hook.
        spoolRepo.update(data.tag_id, next);
      } else {
        log.info({ tagId: data.tag_id, material: data.material, product: data.product }, "New spool detected");
        // Write ISO-8601 explicitly: the SQL default `datetime('now')` returns
        // `YYYY-MM-DD HH:MM:SS` which doesn't match what `$onUpdate` writes.
        const nowIso = new Date().toISOString();
        spoolRepo.create({
          tagId: data.tag_id,
          variantId: data.variant_id,
          material: data.material,
          product: data.product,
          colorHex: data.color_hex,
          colorHexes,
          weight: data.weight,
          remain: data.remain,
          tempMin: data.temp_min,
          tempMax: data.temp_max,
          lastUsed: options?.lastUsed,
          firstSeen: nowIso,
          lastUpdated: nowIso,
        });
        changes.created = true;
        changes.remain = data.remain != null;
        changes.lastUsed = options?.lastUsed != null;
      }

      if (source === "scan") bus.emit("spool:scanned", data.tag_id);
      bus.emit("spool:updated", data.tag_id, changes);

      const row = spoolRepo.findByTagId(data.tag_id)!;
      const syncRow = syncStateRepo.findByTagId(data.tag_id);
      return { spool: enrichSpool(row, syncRow, mapping.byId), created: changes.created };
    },
  };
}
