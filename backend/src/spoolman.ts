import type { AppContext } from "./server.js";
import { matchSlot, type AMSSlot } from "./matcher.js";
import { listRuntimes } from "./mqtt.js";

// Minimum Spoolman types we actually read. The API returns more
// fields, but we only rely on these.
export interface SpoolmanVendor {
  id: number;
  name: string;
}

export interface SpoolmanFilament {
  id: number;
  external_id?: string | null;
  extra?: Record<string, string>;
}

export interface SpoolmanSpool {
  id: number;
  filament: { id: number };
  first_used?: string | null;
  last_used?: string | null;
  archived?: boolean;
  extra?: Record<string, string>;
}

export interface SpoolmanInfo {
  version?: string;
}

interface SpoolmanSettingResponse {
  value: string;
  is_set: boolean;
  type: string;
}

// SpoolmanDB filament shape (as proxied by Spoolman's /external/filament).
// Fields mirror donkie.github.io/SpoolmanDB/filaments.json. Only the
// ones we forward to POST /api/v1/filament are strictly typed.
export interface ExternalFilament {
  id: string;
  name?: string;
  manufacturer?: string;
  material?: string;
  density: number;
  diameter: number;
  weight?: number;
  spool_weight?: number;
  color_hex?: string;
  color_hexes?: string[];
  multi_color_direction?: "coaxial" | "longitudinal";
  extruder_temp?: number;
  bed_temp?: number;
}

// In-memory store of the most recent sync outcome per slot. Rebuilt
// from scratch on restart — there's no persistence layer, so the
// first sync after boot always shows "never" until it runs.
export interface SyncStateEntry {
  status: "synced" | "error";
  at: string;
  signature: string; // tray_uuid|remain at the moment of sync
  spool_id?: number;
  error?: string;
}

export type SyncStateStore = Map<string, SyncStateEntry>;

export function createSyncStateStore(): SyncStateStore {
  return new Map();
}

export function syncStateKey(
  serial: string,
  amsId: number,
  slotId: number
): string {
  return `${serial}#${amsId}#${slotId}`;
}

function slotSignature(slot: AMSSlot): string {
  return `${slot.tray_uuid ?? ""}|${slot.remain ?? ""}`;
}

// Public view of a slot's sync state. "stale" is derived on read: if
// a prior success exists but the slot signature has changed since,
// the recorded result no longer reflects reality.
export type SlotSyncView =
  | { status: "never" }
  | { status: "synced"; spool_id: number; at: string }
  | { status: "stale"; spool_id: number; at: string }
  | { status: "error"; error: string; at: string };

export function getSlotSyncView(
  store: SyncStateStore,
  slot: AMSSlot
): SlotSyncView {
  const entry = store.get(
    syncStateKey(slot.printer_serial, slot.ams_id, slot.slot_id)
  );
  if (!entry) return { status: "never" };
  if (entry.status === "error") {
    return { status: "error", error: entry.error ?? "", at: entry.at };
  }
  const current = slotSignature(slot);
  if (current !== entry.signature) {
    return { status: "stale", spool_id: entry.spool_id!, at: entry.at };
  }
  return { status: "synced", spool_id: entry.spool_id!, at: entry.at };
}

export interface SyncOutcome {
  printer_serial: string;
  ams_id: number;
  slot_id: number;
  spool_id: number;
  used_weight: number;
  created_filament: boolean;
  created_spool: boolean;
}

export interface SyncAllResult {
  synced: SyncOutcome[];
  skipped: Array<{
    printer_serial: string;
    ams_id: number;
    slot_id: number;
    reason: string;
  }>;
  errors: Array<{
    printer_serial: string;
    ams_id: number;
    slot_id: number;
    error: string;
  }>;
}

// Spoolman's `extra` field is documented as a map of JSON-encoded
// strings, so a plain text value is stored wrapped in JSON quotes.
// We normalize both directions through this helper so `find` matches
// whichever convention a spool was created with (ours or Spoolman's
// own UI, which also JSON-encodes).
export function encodeExtraString(value: string): string {
  return JSON.stringify(value);
}

export function decodeExtraString(value: string | undefined): string | null {
  if (value == null) return null;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "string" ? parsed : value;
  } catch {
    return value;
  }
}

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}

export interface SpoolmanClient {
  getInfo(signal?: AbortSignal): Promise<SpoolmanInfo>;
  getBaseUrl(signal?: AbortSignal): Promise<string | null>;
  findVendorByName(name: string): Promise<SpoolmanVendor | null>;
  createVendor(name: string): Promise<SpoolmanVendor>;
  findFilamentByExternalId(externalId: string): Promise<SpoolmanFilament | null>;
  createFilamentFromExternal(externalId: string): Promise<SpoolmanFilament>;
  listSpools(): Promise<SpoolmanSpool[]>;
  ensureSpoolTagField(): Promise<void>;
  createSpool(filamentId: number, trayUuid: string): Promise<SpoolmanSpool>;
  updateSpool(
    spoolId: number,
    patch: {
      used_weight: number;
      last_used: string;
      first_used?: string;
      archived?: boolean;
    }
  ): Promise<SpoolmanSpool>;
}

export function createSpoolmanClient(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch
): SpoolmanClient {
  const base = normalizeBaseUrl(baseUrl);
  // Spoolman rejects `extra` keys that haven't been registered via
  // /api/v1/field/spool. We register "tag" lazily on the first spool
  // create and cache the promise so concurrent syncs share one call.
  let tagFieldRegistered: Promise<void> | null = null;

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal
  ): Promise<T> {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Spoolman ${method} ${path} failed: ${res.status} ${res.statusText}${
          text ? ` — ${text}` : ""
        }`
      );
    }
    // Some endpoints (e.g. 204) return no body; callers only invoke
    // this helper when they expect JSON.
    return (await res.json()) as T;
  }

  return {
    async getInfo(signal) {
      return request<SpoolmanInfo>("GET", "/api/v1/info", undefined, signal);
    },

    async getBaseUrl(signal) {
      // Spoolman stores UI-configurable settings at /api/v1/setting/{key}.
      // `base_url` is the one the user sets under Paramètres → Général.
      // The `value` field is JSON-encoded so we parse twice.
      try {
        const res = await request<SpoolmanSettingResponse>(
          "GET",
          "/api/v1/setting/base_url",
          undefined,
          signal
        );
        if (!res.is_set) return null;
        try {
          const parsed = JSON.parse(res.value);
          if (typeof parsed !== "string" || parsed === "") return null;
          return parsed;
        } catch {
          return null;
        }
      } catch {
        // Older Spoolman versions predate this endpoint; swallow.
        return null;
      }
    },

    async findVendorByName(name) {
      // Spoolman's `name` filter is a case-insensitive partial match,
      // so we re-check exact (case-insensitive) equality on the client.
      const list = await request<SpoolmanVendor[]>(
        "GET",
        `/api/v1/vendor?name=${encodeURIComponent(name)}`
      );
      const needle = name.toLowerCase();
      return list.find((v) => v.name.toLowerCase() === needle) ?? null;
    },

    async createVendor(name) {
      return request<SpoolmanVendor>("POST", "/api/v1/vendor", { name });
    },

    async findFilamentByExternalId(externalId) {
      const list = await request<SpoolmanFilament[]>(
        "GET",
        `/api/v1/filament?external_id=${encodeURIComponent(externalId)}`
      );
      return list[0] ?? null;
    },

    async createFilamentFromExternal(externalId) {
      // Spoolman proxies SpoolmanDB as a flat array; fetch once and
      // pick out the requested id. Not cached: this only runs on the
      // (rare) path where the user has never imported the filament.
      const external = await request<ExternalFilament[]>(
        "GET",
        "/api/v1/external/filament"
      );
      const source = external.find((f) => f.id === externalId);
      if (!source) {
        throw new Error(
          `Filament ${externalId} not found in Spoolman's external database.`
        );
      }
      // Manufacturer is a plain string in SpoolmanDB; find or create
      // the matching Spoolman vendor so the filament is properly
      // attributed instead of being orphaned under "no vendor".
      let vendorId: number | undefined;
      if (source.manufacturer) {
        const existing = await this.findVendorByName(source.manufacturer);
        const vendor = existing ?? (await this.createVendor(source.manufacturer));
        vendorId = vendor.id;
      }
      return request<SpoolmanFilament>("POST", "/api/v1/filament", {
        name: source.name,
        vendor_id: vendorId,
        material: source.material,
        density: source.density,
        diameter: source.diameter,
        weight: source.weight,
        spool_weight: source.spool_weight,
        color_hex: source.color_hex,
        multi_color_hexes: source.color_hexes?.join(","),
        multi_color_direction: source.multi_color_direction,
        settings_extruder_temp: source.extruder_temp,
        settings_bed_temp: source.bed_temp,
        external_id: source.id
      });
    },

    async listSpools() {
      // Include archived spools so we can find & refresh them instead
      // of creating a duplicate on the next sync (e.g. after archive
      // on empty, or a physically-refilled spool).
      return request<SpoolmanSpool[]>(
        "GET",
        "/api/v1/spool?allow_archived=true"
      );
    },

    async ensureSpoolTagField() {
      if (!tagFieldRegistered) {
        tagFieldRegistered = request<unknown>(
          "POST",
          "/api/v1/field/spool/tag",
          { name: "Tag", field_type: "text" }
        )
          .then(() => undefined)
          .catch((err) => {
            // Reset the memo so the next attempt retries.
            tagFieldRegistered = null;
            throw err;
          });
      }
      return tagFieldRegistered;
    },

    async createSpool(filamentId, trayUuid) {
      await this.ensureSpoolTagField();
      const now = new Date().toISOString();
      return request<SpoolmanSpool>("POST", "/api/v1/spool", {
        filament_id: filamentId,
        first_used: now,
        last_used: now,
        extra: { tag: encodeExtraString(trayUuid) }
      });
    },

    async updateSpool(spoolId, patch) {
      return request<SpoolmanSpool>("PATCH", `/api/v1/spool/${spoolId}`, patch);
    }
  };
}

// Reasons why a slot can't or shouldn't be synced. Returned as the
// `skipped` reason from syncAll instead of throwing — they are
// expected and silent.
export type SkipReason =
  | "not_matched"
  | "missing_tray_uuid"
  | "missing_weight"
  | "missing_remain";

export function evaluateSlotForSync(
  slot: AMSSlot,
  mapping: Map<string, import("./matcher.js").FilamentEntry>
):
  | { ok: true; spoolmanId: string; trayWeight: number; usedWeight: number }
  | { ok: false; reason: SkipReason } {
  const match = matchSlot(slot, mapping);
  if (match.type !== "matched" || !match.entry?.spoolman_id) {
    return { ok: false, reason: "not_matched" };
  }
  if (!slot.tray_uuid) return { ok: false, reason: "missing_tray_uuid" };
  if (slot.tray_weight == null) return { ok: false, reason: "missing_weight" };
  if (slot.remain == null) return { ok: false, reason: "missing_remain" };
  const trayWeight = Number(slot.tray_weight);
  if (!Number.isFinite(trayWeight) || trayWeight <= 0) {
    return { ok: false, reason: "missing_weight" };
  }
  const usedWeight = Math.max(0, trayWeight * (1 - slot.remain / 100));
  return {
    ok: true,
    spoolmanId: match.entry.spoolman_id,
    trayWeight,
    usedWeight
  };
}

async function syncOneSlot(
  client: SpoolmanClient,
  slot: AMSSlot,
  spoolmanId: string,
  usedWeight: number,
  options: { archiveOnEmpty: boolean }
): Promise<Omit<SyncOutcome, "printer_serial" | "ams_id" | "slot_id">> {
  let createdFilament = false;
  let filament = await client.findFilamentByExternalId(spoolmanId);
  if (!filament) {
    filament = await client.createFilamentFromExternal(spoolmanId);
    createdFilament = true;
  }

  const trayUuid = slot.tray_uuid!;
  const spools = await client.listSpools();
  let spool =
    spools.find((s) => decodeExtraString(s.extra?.tag) === trayUuid) ?? null;
  let createdSpool = false;
  if (!spool) {
    spool = await client.createSpool(filament.id, trayUuid);
    createdSpool = true;
  }

  const now = new Date().toISOString();
  const shouldArchive = options.archiveOnEmpty && slot.remain === 0;
  await client.updateSpool(spool.id, {
    used_weight: usedWeight,
    last_used: now,
    // Backfill for spools that existed before we started tracking
    // first_used (e.g. created manually in Spoolman). Freshly-created
    // spools already carry it from createSpool, so this is a no-op.
    ...(spool.first_used ? {} : { first_used: now }),
    ...(shouldArchive ? { archived: true } : {})
  });
  return {
    spool_id: spool.id,
    used_weight: usedWeight,
    created_filament: createdFilament,
    created_spool: createdSpool
  };
}

function findSlot(
  ctx: AppContext,
  printerSerial: string,
  amsId: number,
  slotId: number
): AMSSlot | null {
  const runtime = listRuntimes(ctx.mqttState).find(
    (r) => r.printer.serial === printerSerial
  );
  if (!runtime) return null;
  return (
    runtime.slots.find((s) => s.ams_id === amsId && s.slot_id === slotId) ??
    null
  );
}

export async function syncSlot(
  ctx: AppContext,
  printerSerial: string,
  amsId: number,
  slotId: number,
  clientFactory: (url: string) => SpoolmanClient = createSpoolmanClient
): Promise<SyncOutcome> {
  const url = ctx.config.spoolman?.url;
  if (!url) throw new Error("Spoolman URL is not configured.");

  const slot = findSlot(ctx, printerSerial, amsId, slotId);
  if (!slot) {
    throw new Error(
      `Slot ${amsId}/${slotId} on printer ${printerSerial} is not available.`
    );
  }
  const evaluated = evaluateSlotForSync(slot, ctx.mapping.byId);
  if (!evaluated.ok) {
    throw new Error(`Slot cannot be synced: ${evaluated.reason}.`);
  }
  const key = syncStateKey(printerSerial, amsId, slotId);
  try {
    const client = clientFactory(url);
    const outcome = await syncOneSlot(
      client,
      slot,
      evaluated.spoolmanId,
      evaluated.usedWeight,
      { archiveOnEmpty: ctx.config.spoolman?.archive_on_empty ?? false }
    );
    ctx.syncState.set(key, {
      status: "synced",
      at: new Date().toISOString(),
      signature: slotSignature(slot),
      spool_id: outcome.spool_id
    });
    return {
      printer_serial: printerSerial,
      ams_id: amsId,
      slot_id: slotId,
      ...outcome
    };
  } catch (err) {
    ctx.syncState.set(key, {
      status: "error",
      at: new Date().toISOString(),
      signature: slotSignature(slot),
      error: err instanceof Error ? err.message : String(err)
    });
    throw err;
  }
}

export async function syncAll(
  ctx: AppContext,
  clientFactory: (url: string) => SpoolmanClient = createSpoolmanClient
): Promise<SyncAllResult> {
  const url = ctx.config.spoolman?.url;
  if (!url) throw new Error("Spoolman URL is not configured.");
  const client = clientFactory(url);
  const options = {
    archiveOnEmpty: ctx.config.spoolman?.archive_on_empty ?? false
  };

  const result: SyncAllResult = { synced: [], skipped: [], errors: [] };
  for (const runtime of listRuntimes(ctx.mqttState)) {
    for (const slot of runtime.slots) {
      const evaluated = evaluateSlotForSync(slot, ctx.mapping.byId);
      if (!evaluated.ok) {
        result.skipped.push({
          printer_serial: runtime.printer.serial,
          ams_id: slot.ams_id,
          slot_id: slot.slot_id,
          reason: evaluated.reason
        });
        continue;
      }
      const key = syncStateKey(
        runtime.printer.serial,
        slot.ams_id,
        slot.slot_id
      );
      try {
        const outcome = await syncOneSlot(
          client,
          slot,
          evaluated.spoolmanId,
          evaluated.usedWeight,
          options
        );
        ctx.syncState.set(key, {
          status: "synced",
          at: new Date().toISOString(),
          signature: slotSignature(slot),
          spool_id: outcome.spool_id
        });
        result.synced.push({
          printer_serial: runtime.printer.serial,
          ams_id: slot.ams_id,
          slot_id: slot.slot_id,
          ...outcome
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        ctx.syncState.set(key, {
          status: "error",
          at: new Date().toISOString(),
          signature: slotSignature(slot),
          error: message
        });
        result.errors.push({
          printer_serial: runtime.printer.serial,
          ams_id: slot.ams_id,
          slot_id: slot.slot_id,
          error: message
        });
      }
    }
  }
  return result;
}
