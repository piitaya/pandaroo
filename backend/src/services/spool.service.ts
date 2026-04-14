import type { SpoolReading, Spool, SyncState, CatalogEntry } from "@bambu-spoolman-sync/shared";
import type { SpoolRepository, SpoolRow } from "../db/spool.repository.js";
import type { SyncStateRepository, SpoolSyncStateRow } from "../db/sync-state.repository.js";
import type { Mapping } from "../filament-catalog.js";
import { matchSpool } from "../filament-catalog.js";
import type { FastifyBaseLogger } from "fastify";
import type { AppEventBus } from "../events.js";

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
  location?: { printer_serial: string; ams_id: number; slot_id: number };
}

export interface SpoolService {
  list(): Spool[];
  findByTagId(tagId: string): Spool | undefined;
  delete(tagId: string): boolean;
  listTagIds(): string[];
  patch(tagId: string, data: { remain?: number }): Spool | undefined;
  upsert(data: SpoolReading, options?: UpsertOptions): void;
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
      if (!spoolRepo.findByTagId(tagId)) return undefined;
      const now = new Date().toISOString();
      spoolRepo.update(tagId, { ...data, lastUpdated: now });
      log.info({ tagId, ...data }, "Spool updated manually");
      bus.emit("spool:updated", tagId);
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
      if (!hasTagId(data)) return;
      const now = new Date().toISOString();
      const existing = spoolRepo.findByTagId(data.tag_id);

      const colorHexes = serializeColorHexes(data.color_hexes);
      const loc = options?.location;

      if (existing) {
        log.debug({ tagId: data.tag_id, remain: data.remain }, "Spool updated");
        spoolRepo.update(data.tag_id, {
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
          ...(loc && {
            lastPrinterSerial: loc.printer_serial,
            lastAmsId: loc.ams_id,
            lastSlotId: loc.slot_id,
          }),
          lastUpdated: now,
        });
      } else {
        log.info({ tagId: data.tag_id, material: data.material, product: data.product }, "New spool detected");
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
          lastPrinterSerial: loc?.printer_serial ?? null,
          lastAmsId: loc?.ams_id ?? null,
          lastSlotId: loc?.slot_id ?? null,
          lastUpdated: now,
          firstSeen: now,
        });
      }

      bus.emit("spool:updated", data.tag_id);
    },
  };
}
