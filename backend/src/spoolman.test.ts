import { describe, expect, it, vi } from "vitest";
import {
  createSpoolmanClient,
  createSyncStateStore,
  decodeExtraString,
  encodeExtraString,
  evaluateSpoolForSync,
  getSlotSyncView,
  syncAll,
  syncSlot,
  syncStateKey,
  type SpoolmanClient,
  type SpoolmanFilament,
  type SpoolmanSpool
} from "./spoolman.js";
import type { FilamentEntry } from "./matcher.js";
import type { AmsSlot, Spool } from "./spool.js";
import type { AppContext } from "./server.js";
import type { MqttState } from "./mqtt.js";

const mapping = new Map<string, FilamentEntry>([
  ["A01-B6", { id: "A01-B6", spoolman_id: "bambulab_pla_matte_darkblue" }],
  ["A18-B0", { id: "A18-B0", spoolman_id: null }]
]);

const baseSpool = (over: Partial<Spool> = {}): Spool => ({
  uid: "UID-1", variant_id: "A01-B6", material: "PLA", product: "PLA Matte",
  color_hex: "042F56FF", color_hexes: null, weight: 1000,
  temp_min: 220, temp_max: 240, remain: 75, ...over
});

const slot = (overSpool?: Partial<Spool> | null, overSlot?: Partial<AmsSlot>): AmsSlot => ({
  printer_serial: "AC12", ams_id: 0, slot_id: 0, nozzle_id: 0, has_spool: true,
  spool: overSpool === null ? null : baseSpool(overSpool), ...overSlot
});

function buildContext(slots: AmsSlot[]): AppContext {
  // Group flat slots into AmsUnit[] keyed by ams_id
  const unitMap = new Map<number, AmsSlot[]>();
  for (const s of slots) {
    const arr = unitMap.get(s.ams_id);
    if (arr) arr.push(s);
    else unitMap.set(s.ams_id, [s]);
  }
  const ams_units = Array.from(unitMap.entries()).map(([id, items]) => ({
    id,
    nozzle_id: items[0].nozzle_id,
    slots: items
  }));
  const mqttState: MqttState = new Map();
  mqttState.set("AC12", {
    printer: { name: "X1C", host: "10.0.0.1", serial: "AC12", access_code: "abc", enabled: true },
    status: { lastError: null, errorCode: null }, ams_units,
    mqtt: {} as any, async disconnect() {}
  } as any);
  return {
    config: {
      printers: [], mapping: { refresh_interval_hours: 24 },
      spoolman: { url: "http://spoolman.local", auto_sync: false, archive_on_empty: false }
    },
    configFilePath: "",
    mapping: { byId: mapping, fetchedAt: null, refresh: (async () => 0) as any, setInterval: () => {}, stop: () => {} } as any,
    mqttState, syncState: createSyncStateStore(), syncFromConfig: () => {}
  };
}

function fakeClient(over: Partial<SpoolmanClient> = {}): SpoolmanClient {
  return {
    async getInfo() { return { version: "test" }; },
    async getBaseUrl() { return null; },
    async findVendorByName() { return null; },
    async createVendor() { return { id: 1, name: "Bambu Lab" }; },
    async findFilamentByExternalId() { return null; },
    async createFilamentFromExternal() { return { id: 42 } as SpoolmanFilament; },
    async listSpools() { return []; },
    async ensureSpoolTagField() {},
    async createSpool() { return { id: 7, filament: { id: 42 } } as SpoolmanSpool; },
    async updateSpool(id) { return { id, filament: { id: 42 } } as SpoolmanSpool; },
    ...over
  };
}

describe("encodeExtraString / decodeExtraString", () => {
  it("round-trips a value through JSON encoding", () => { expect(decodeExtraString(encodeExtraString("UID-1"))).toBe("UID-1"); });
  it("decodes a raw string stored without JSON encoding", () => { expect(decodeExtraString("UID-1")).toBe("UID-1"); });
  it("returns null for undefined input", () => { expect(decodeExtraString(undefined)).toBeNull(); });
});

describe("getSlotSyncView", () => {
  it("returns never when no sync has been recorded", () => {
    expect(getSlotSyncView(createSyncStateStore(), slot())).toEqual({ status: "never" });
  });
  it("returns synced when slot signature matches", () => {
    const store = createSyncStateStore();
    store.set(syncStateKey("AC12", 0, 0), { status: "synced", at: "2024-01-01T00:00:00Z", signature: "UID-1|75", spool_id: 9 });
    expect(getSlotSyncView(store, slot())).toEqual({ status: "synced", at: "2024-01-01T00:00:00Z", spool_id: 9 });
  });
  it("returns stale when spool uid changed since last sync", () => {
    const store = createSyncStateStore();
    store.set(syncStateKey("AC12", 0, 0), { status: "synced", at: "2024-01-01T00:00:00Z", signature: "UID-OLD|75", spool_id: 9 });
    expect(getSlotSyncView(store, slot()).status).toBe("stale");
  });
  it("returns stale when remain changed since last sync", () => {
    const store = createSyncStateStore();
    store.set(syncStateKey("AC12", 0, 0), { status: "synced", at: "2024-01-01T00:00:00Z", signature: "UID-1|100", spool_id: 9 });
    expect(getSlotSyncView(store, slot()).status).toBe("stale");
  });
  it("returns error with message and timestamp", () => {
    const store = createSyncStateStore();
    store.set(syncStateKey("AC12", 0, 0), { status: "error", at: "2024-01-01T00:00:00Z", signature: "UID-1|75", error: "boom" });
    expect(getSlotSyncView(store, slot())).toEqual({ status: "error", at: "2024-01-01T00:00:00Z", error: "boom" });
  });
});

describe("evaluateSpoolForSync", () => {
  it("returns ok with spoolman id and computed used weight", () => {
    const r = evaluateSpoolForSync(baseSpool(), mapping);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.spoolmanId).toBe("bambulab_pla_matte_darkblue"); expect(r.usedWeight).toBeCloseTo(250); }
  });
  it("rejects known_unmapped variants", () => { expect(evaluateSpoolForSync(baseSpool({ variant_id: "A18-B0" }), mapping)).toEqual({ ok: false, reason: "not_matched" }); });
  it("rejects unknown variants", () => { expect(evaluateSpoolForSync(baseSpool({ variant_id: "X99" }), mapping)).toEqual({ ok: false, reason: "not_matched" }); });
  it("rejects null spool", () => { expect(evaluateSpoolForSync(null, mapping)).toEqual({ ok: false, reason: "no_spool" }); });
  it("rejects spool with no weight", () => { expect(evaluateSpoolForSync(baseSpool({ weight: null }), mapping)).toEqual({ ok: false, reason: "missing_weight" }); });
  it("rejects spool with zero weight", () => { expect(evaluateSpoolForSync(baseSpool({ weight: "0" }), mapping)).toEqual({ ok: false, reason: "missing_weight" }); });
  it("rejects spool with no remain", () => { expect(evaluateSpoolForSync(baseSpool({ remain: null }), mapping)).toEqual({ ok: false, reason: "missing_remain" }); });
});

describe("syncSlot", () => {
  it("finds existing filament and spool, patches used weight", async () => {
    const patch = vi.fn(async (id: number) => ({ id, filament: { id: 42 } }) as SpoolmanSpool);
    const client = fakeClient({
      async findFilamentByExternalId() { return { id: 42 }; },
      async listSpools() { return [{ id: 9, filament: { id: 42 }, first_used: "2024-01-01", extra: { tag: encodeExtraString("UID-1") } }]; },
      updateSpool: patch
    });
    const ctx = buildContext([slot()]);
    const outcome = await syncSlot(ctx, "AC12", 0, 0, () => client);
    expect(outcome).toMatchObject({ spool_id: 9, used_weight: 250, created_filament: false, created_spool: false });
  });

  it("auto-creates filament when not in Spoolman", async () => {
    const create = vi.fn(async () => ({ id: 99 }) as SpoolmanFilament);
    const client = fakeClient({ async findFilamentByExternalId() { return null; }, createFilamentFromExternal: create });
    const ctx = buildContext([slot()]);
    const outcome = await syncSlot(ctx, "AC12", 0, 0, () => client);
    expect(create).toHaveBeenCalledWith("bambulab_pla_matte_darkblue");
    expect(outcome).toMatchObject({ created_filament: true, created_spool: true });
  });

  it("matches spool by non-JSON-encoded extra.tag (legacy)", async () => {
    const client = fakeClient({
      async findFilamentByExternalId() { return { id: 42 }; },
      async listSpools() { return [{ id: 5, filament: { id: 42 }, extra: { tag: "UID-1" } }]; }
    });
    const ctx = buildContext([slot()]);
    expect((await syncSlot(ctx, "AC12", 0, 0, () => client)).spool_id).toBe(5);
  });

  it("archives spool when remain is 0 and archive_on_empty is true", async () => {
    const patch = vi.fn(async (id: number) => ({ id, filament: { id: 42 } }) as SpoolmanSpool);
    const client = fakeClient({
      async findFilamentByExternalId() { return { id: 42 }; },
      async listSpools() { return [{ id: 9, filament: { id: 42 }, first_used: "2024-01-01", extra: { tag: encodeExtraString("UID-1") } }]; },
      updateSpool: patch
    });
    const ctx = buildContext([slot({ remain: 0 })]);
    ctx.config = {
      ...ctx.config,
      spoolman: { url: "http://spoolman.local", auto_sync: false, archive_on_empty: true }
    };
    await syncSlot(ctx, "AC12", 0, 0, () => client);
    const patchArg = (patch.mock.calls[0] as unknown as [number, Record<string, unknown>])[1];
    expect(patchArg.archived).toBe(true);
  });

  it("does not archive when archive_on_empty is false", async () => {
    const patch = vi.fn(async (id: number) => ({ id, filament: { id: 42 } }) as SpoolmanSpool);
    const client = fakeClient({
      async findFilamentByExternalId() { return { id: 42 }; },
      async listSpools() { return [{ id: 9, filament: { id: 42 }, first_used: "2024-01-01", extra: { tag: encodeExtraString("UID-1") } }]; },
      updateSpool: patch
    });
    const ctx = buildContext([slot({ remain: 0 })]);
    await syncSlot(ctx, "AC12", 0, 0, () => client);
    const patchArg = (patch.mock.calls[0] as unknown as [number, Record<string, unknown>])[1];
    expect(patchArg.archived).toBeUndefined();
  });

  it("records success in syncState", async () => {
    const client = fakeClient({ async findFilamentByExternalId() { return { id: 42 }; } });
    const ctx = buildContext([slot()]);
    await syncSlot(ctx, "AC12", 0, 0, () => client);
    expect(getSlotSyncView(ctx.syncState, slot()).status).toBe("synced");
  });

  it("records error in syncState", async () => {
    const client = fakeClient({ async findFilamentByExternalId() { throw new Error("down"); } });
    const ctx = buildContext([slot()]);
    await expect(syncSlot(ctx, "AC12", 0, 0, () => client)).rejects.toThrow(/down/);
    expect(getSlotSyncView(ctx.syncState, slot()).status).toBe("error");
  });

  it("rejects when URL not configured", async () => {
    const ctx = buildContext([slot()]);
    ctx.config = { ...ctx.config, spoolman: { auto_sync: false, archive_on_empty: false } };
    await expect(syncSlot(ctx, "AC12", 0, 0, () => fakeClient())).rejects.toThrow(/not configured/);
  });

  it("rejects when not matched", async () => {
    const ctx = buildContext([slot({ variant_id: "A18-B0" })]);
    await expect(syncSlot(ctx, "AC12", 0, 0, () => fakeClient())).rejects.toThrow(/not_matched/);
  });
});

describe("syncAll", () => {
  it("separates synced from skipped", async () => {
    const client = fakeClient({
      async findFilamentByExternalId() { return { id: 42 }; },
      updateSpool: vi.fn(async (id: number) => ({ id, filament: { id: 42 } }) as SpoolmanSpool)
    });
    const ctx = buildContext([
      slot({}, { ams_id: 0, slot_id: 0 }),
      slot({ variant_id: "X99" }, { ams_id: 0, slot_id: 1 }),
      slot(null, { ams_id: 0, slot_id: 2 })
    ]);
    const r = await syncAll(ctx, () => client);
    expect(r.synced).toHaveLength(1);
    expect(r.skipped).toHaveLength(2);
    expect(r.errors).toHaveLength(0);
  });

  it("collects errors without aborting", async () => {
    let calls = 0;
    const client = fakeClient({
      async findFilamentByExternalId() { calls++; if (calls === 1) throw new Error("boom"); return { id: 42 }; }
    });
    const ctx = buildContext([slot({}, { slot_id: 0 }), slot({ uid: "UID-2" }, { slot_id: 1 })]);
    const r = await syncAll(ctx, () => client);
    expect(r.errors).toHaveLength(1);
    expect(r.synced).toHaveLength(1);
  });
});

describe("createSpoolmanClient", () => {
  it("strips trailing slashes from base URL", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ version: "0.21" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const c = createSpoolmanClient("http://spoolman.local///", f as unknown as typeof fetch);
    expect((await c.getInfo()).version).toBe("0.21");
    expect(f).toHaveBeenCalledWith("http://spoolman.local/api/v1/info", expect.objectContaining({ method: "GET" }));
  });

  it("throws on non-2xx response", async () => {
    const f = vi.fn(async () => new Response("bad", { status: 400, statusText: "Bad Request" }));
    await expect(createSpoolmanClient("http://x", f as unknown as typeof fetch).getInfo()).rejects.toThrow(/400/);
  });

  it("registers extra.tag field before first spool creation, skips on subsequent", async () => {
    const calls: [string, RequestInit][] = [];
    const f = (async (url: string, init: RequestInit) => { calls.push([url, init]); return new Response(JSON.stringify({ id: 1, filament: { id: 42 } }), { status: 200, headers: { "Content-Type": "application/json" } }); }) as unknown as typeof fetch;
    const c = createSpoolmanClient("http://s", f);
    await c.createSpool(42, "UID-9");
    await c.createSpool(42, "UID-10");
    expect(calls).toHaveLength(3);
    expect(calls[0][0]).toContain("/field/spool/tag");
    expect(calls[1][0]).toContain("/spool");
    expect(calls[2][0]).toContain("/spool");
  });
});
