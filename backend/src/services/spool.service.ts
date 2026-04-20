import type { SpoolReading, Spool, SyncState, CatalogEntry } from "@bambu-spoolman-sync/shared";
import type { SpoolRepository, SpoolRow } from "../db/spool.repository.js";
import type { SyncStateRepository, SpoolSyncStateRow } from "../db/sync-state.repository.js";
import type { Mapping } from "../filament-catalog.js";
import { matchSpool } from "../filament-catalog.js";
import type { FastifyBaseLogger } from "fastify";
import type { AppEventBus } from "../events.js";

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

export type PatchSpoolResult =
  | { ok: true; spool: Spool }
  | { ok: false; reason: "not_found" | "ams_managed" };

export type DeleteSpoolResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "ams_loaded" };

export interface SpoolService {
  list(): Spool[];
  findByTagId(tagId: string): Spool | undefined;
  delete(tagId: string): DeleteSpoolResult;
  listTagIds(): string[];
  patch(tagId: string, data: { remain?: number }): PatchSpoolResult;
  upsert(data: SpoolReading, options?: UpsertOptions): UpsertResult | undefined;
}

export interface SpoolServiceDeps {
  spoolRepo: SpoolRepository;
  syncStateRepo: SyncStateRepository;
  mapping: Mapping;
  bus: AppEventBus;
  log: FastifyBaseLogger;
  getAmsReading: (tagId: string) => SpoolReading | null;
}

export function createSpoolService(deps: SpoolServiceDeps): SpoolService {
  const { spoolRepo, syncStateRepo, mapping, bus, log, getAmsReading } = deps;

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
      if (data.remain != null && getAmsReading(tagId)?.remain != null) {
        return { ok: false, reason: "ams_managed" };
      }
      const before = spoolRepo.findByTagId(tagId);
      if (!before) return { ok: false, reason: "not_found" };
      spoolRepo.update(tagId, data);
      log.info({ tagId, ...data }, "Spool updated manually");
      bus.emit("spool:adjusted", tagId);
      bus.emit("spool:updated", tagId);
      const row = { ...before, ...data, lastUpdated: new Date().toISOString() };
      const syncRow = syncStateRepo.findByTagId(tagId);
      return { ok: true, spool: enrichSpool(row, syncRow, mapping.byId) };
    },

    delete(tagId) {
      if (getAmsReading(tagId) != null) return { ok: false, reason: "ams_loaded" };
      const deleted = spoolRepo.delete(tagId);
      if (!deleted) return { ok: false, reason: "not_found" };
      log.info({ tagId }, "Spool deleted");
      return { ok: true };
    },

    listTagIds() {
      return spoolRepo.list().map((row) => row.tagId);
    },

    upsert(data, options) {
      if (!data.tag_id) return undefined;
      const tagId = data.tag_id;
      const existing = spoolRepo.findByTagId(tagId);
      const colorHexes = serializeColorHexes(data.color_hexes);
      const source = options?.source;

      let row: SpoolRow;
      let created = false;

      if (existing) {
        const next = {
          variantId: data.variant_id ?? existing.variantId,
          material: data.material ?? existing.material,
          product: data.product ?? existing.product,
          colorHex: data.color_hex ?? existing.colorHex,
          colorHexes: colorHexes ?? existing.colorHexes,
          weight: data.weight ?? existing.weight,
          remain: data.remain ?? existing.remain,
          tempMin: data.temp_min ?? existing.tempMin,
          tempMax: data.temp_max ?? existing.tempMax,
          lastUsed: options?.lastUsed ?? existing.lastUsed,
        };

        // Identity fields (material, colours, temps, capacity) are stamped on
        // the RFID chip and don't change, so `remain` and `lastUsed` are the
        // only fields we need to check for a no-op.
        const changed =
          next.remain !== existing.remain ||
          next.lastUsed !== existing.lastUsed;

        if (!changed) {
          if (source === "scan") bus.emit("spool:scanned", tagId);
          const syncRow = syncStateRepo.findByTagId(tagId);
          return { spool: enrichSpool(existing, syncRow, mapping.byId), created: false };
        }

        spoolRepo.update(tagId, next);
        // $onUpdate auto-bumps lastUpdated in the DB; mirror it in-memory for
        // the return value without a second read.
        row = { ...existing, ...next, lastUpdated: new Date().toISOString() };
      } else {
        log.info({ tagId, material: data.material, product: data.product }, "New spool detected");
        const nowIso = new Date().toISOString();
        row = {
          tagId,
          variantId: data.variant_id,
          material: data.material,
          product: data.product,
          colorHex: data.color_hex,
          colorHexes,
          weight: data.weight,
          remain: data.remain,
          tempMin: data.temp_min,
          tempMax: data.temp_max,
          lastUsed: options?.lastUsed ?? null,
          firstSeen: nowIso,
          lastUpdated: nowIso,
        };
        spoolRepo.create(row);
        created = true;
      }

      if (source === "scan") bus.emit("spool:scanned", tagId);
      bus.emit("spool:updated", tagId);

      const syncRow = syncStateRepo.findByTagId(tagId);
      return { spool: enrichSpool(row, syncRow, mapping.byId), created };
    },
  };
}
