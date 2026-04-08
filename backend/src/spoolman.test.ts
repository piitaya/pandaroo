import { describe, expect, it, vi } from "vitest";
import {
  createSpoolmanClient,
  createSyncStateStore,
  decodeExtraString,
  encodeExtraString,
  evaluateSlotForSync,
  getSlotSyncView,
  syncAll,
  syncSlot,
  syncStateKey,
  type SpoolmanClient,
  type SpoolmanFilament,
  type SpoolmanSpool
} from "./spoolman.js";
import type { AMSSlot, FilamentEntry } from "./matcher.js";
import type { AppContext } from "./server.js";
import type { MqttState } from "./mqtt.js";

const mapping = new Map<string, FilamentEntry>([
  ["A01-B6", { id: "A01-B6", spoolman_id: "bambulab_pla_matte_darkblue" }],
  ["A18-B0", { id: "A18-B0", spoolman_id: null }]
]);

const slot = (over: Partial<AMSSlot> = {}): AMSSlot => ({
  printer_serial: "AC12",
  ams_id: 0,
  nozzle_id: 0,
  slot_id: 0,
  tray_id_name: "A01-B6",
  tray_sub_brands: "PLA Matte",
  tray_type: "PLA",
  tray_color: "042F56FF",
  tray_uuid: "UID-1",
  nozzle_temp_min: 220,
  nozzle_temp_max: 240,
  tray_weight: "1000",
  remain: 75,
  ...over
});

// Build an AppContext just complete enough for syncSlot/syncAll. The
// mqttState is a real Map so listRuntimes can walk it; we feed it a
// fake InternalClient exposing the slots we want to sync.
function buildContext(slots: AMSSlot[]): AppContext {
  const mqttState: MqttState = new Map();
  mqttState.set("AC12", {
    printer: {
      name: "X1C",
      host: "10.0.0.1",
      serial: "AC12",
      access_code: "abc",
      enabled: true
    },
    status: { lastError: null, errorCode: null },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    slots: slots as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mqtt: {} as any,
    async disconnect() {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  return {
    config: {
      printers: [],
      mapping: { refresh_interval_hours: 24 },
      spoolman: {
        url: "http://spoolman.local",
        auto_sync: false,
        archive_on_empty: false
      }
    },
    configFilePath: "",
    mapping: {
      byId: mapping,
      fetchedAt: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      refresh: (async () => 0) as any,
      setInterval: () => {},
      stop: () => {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    mqttState,
    syncState: createSyncStateStore(),
    syncFromConfig: () => {}
  };
}

function fakeClient(over: Partial<SpoolmanClient> = {}): SpoolmanClient {
  return {
    async getInfo() {
      return { version: "test" };
    },
    async findVendorByName() {
      return null;
    },
    async createVendor() {
      return { id: 1, name: "Bambu Lab" };
    },
    async findFilamentByExternalId() {
      return null;
    },
    async createFilamentFromExternal() {
      return { id: 42 } as SpoolmanFilament;
    },
    async listSpools() {
      return [];
    },
    async ensureSpoolTagField() {
      // no-op in tests
    },
    async createSpool() {
      return { id: 7, filament: { id: 42 } } as SpoolmanSpool;
    },
    async updateSpool(id) {
      return { id, filament: { id: 42 } } as SpoolmanSpool;
    },
    ...over
  };
}

describe("getSlotSyncView", () => {
  it("returns never when no entry is recorded", () => {
    const store = createSyncStateStore();
    expect(getSlotSyncView(store, slot())).toEqual({ status: "never" });
  });

  it("returns synced when the signature still matches", () => {
    const store = createSyncStateStore();
    store.set(syncStateKey("AC12", 0, 0), {
      status: "synced",
      at: "2024-01-01T00:00:00Z",
      signature: "UID-1|75",
      spool_id: 9
    });
    expect(getSlotSyncView(store, slot())).toEqual({
      status: "synced",
      at: "2024-01-01T00:00:00Z",
      spool_id: 9
    });
  });

  it("flips to stale when tray_uuid changes", () => {
    const store = createSyncStateStore();
    store.set(syncStateKey("AC12", 0, 0), {
      status: "synced",
      at: "2024-01-01T00:00:00Z",
      signature: "UID-OLD|75",
      spool_id: 9
    });
    expect(getSlotSyncView(store, slot()).status).toBe("stale");
  });

  it("flips to stale when remain changes", () => {
    const store = createSyncStateStore();
    store.set(syncStateKey("AC12", 0, 0), {
      status: "synced",
      at: "2024-01-01T00:00:00Z",
      signature: "UID-1|100",
      spool_id: 9
    });
    expect(getSlotSyncView(store, slot()).status).toBe("stale");
  });

  it("returns error entries as-is", () => {
    const store = createSyncStateStore();
    store.set(syncStateKey("AC12", 0, 0), {
      status: "error",
      at: "2024-01-01T00:00:00Z",
      signature: "UID-1|75",
      error: "boom"
    });
    const view = getSlotSyncView(store, slot());
    expect(view).toEqual({
      status: "error",
      at: "2024-01-01T00:00:00Z",
      error: "boom"
    });
  });
});

describe("encodeExtraString / decodeExtraString", () => {
  it("round-trips a raw value through JSON encoding", () => {
    expect(decodeExtraString(encodeExtraString("UID-1"))).toBe("UID-1");
  });
  it("tolerates legacy non-encoded values", () => {
    expect(decodeExtraString("UID-1")).toBe("UID-1");
  });
  it("returns null for missing input", () => {
    expect(decodeExtraString(undefined)).toBeNull();
  });
});

describe("evaluateSlotForSync", () => {
  it("returns ok with computed used weight for a matched slot", () => {
    const r = evaluateSlotForSync(slot(), mapping);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.spoolmanId).toBe("bambulab_pla_matte_darkblue");
      expect(r.usedWeight).toBeCloseTo(250, 6);
    }
  });
  it("skips known_unmapped slots", () => {
    const r = evaluateSlotForSync(slot({ tray_id_name: "A18-B0" }), mapping);
    expect(r).toEqual({ ok: false, reason: "not_matched" });
  });
  it("skips unknown variants", () => {
    const r = evaluateSlotForSync(slot({ tray_id_name: "X99-Z9" }), mapping);
    expect(r).toEqual({ ok: false, reason: "not_matched" });
  });
  it("skips slots without a tray uuid", () => {
    const r = evaluateSlotForSync(slot({ tray_uuid: null }), mapping);
    expect(r).toEqual({ ok: false, reason: "missing_tray_uuid" });
  });
  it("skips slots with no tray weight", () => {
    const r = evaluateSlotForSync(slot({ tray_weight: null }), mapping);
    expect(r).toEqual({ ok: false, reason: "missing_weight" });
  });
  it("skips slots with a zero tray weight", () => {
    const r = evaluateSlotForSync(slot({ tray_weight: "0" }), mapping);
    expect(r).toEqual({ ok: false, reason: "missing_weight" });
  });
  it("skips slots with no remain", () => {
    const r = evaluateSlotForSync(slot({ remain: null }), mapping);
    expect(r).toEqual({ ok: false, reason: "missing_remain" });
  });
});

describe("syncSlot", () => {
  it("finds an existing filament + spool and patches used + last used", async () => {
    const patch = vi.fn(async (id: number) => ({
      id,
      filament: { id: 42 }
    }) as SpoolmanSpool);
    const client = fakeClient({
      async findFilamentByExternalId() {
        return { id: 42, external_id: "bambulab_pla_matte_darkblue" };
      },
      async listSpools() {
        return [
          {
            id: 9,
            filament: { id: 42 },
            first_used: "2024-01-01T00:00:00Z",
            extra: { tag: encodeExtraString("UID-1") }
          }
        ];
      },
      updateSpool: patch
    });
    const ctx = buildContext([slot()]);
    const outcome = await syncSlot(ctx, "AC12", 0, 0, () => client);
    expect(outcome).toMatchObject({
      spool_id: 9,
      used_weight: 250,
      created_filament: false,
      created_spool: false
    });
    expect(patch).toHaveBeenCalledTimes(1);
    const [spoolIdArg, patchArg] = patch.mock.calls[0]! as unknown as [
      number,
      { used_weight: number; last_used: string; first_used?: string }
    ];
    expect(spoolIdArg).toBe(9);
    expect(patchArg.used_weight).toBe(250);
    expect(typeof patchArg.last_used).toBe("string");
    // Spool already had first_used; should not be backfilled.
    expect(patchArg.first_used).toBeUndefined();
  });

  it("backfills first_used when an existing spool lacks it", async () => {
    const patch = vi.fn(async (id: number) => ({
      id,
      filament: { id: 42 }
    }) as SpoolmanSpool);
    const client = fakeClient({
      async findFilamentByExternalId() {
        return { id: 42 };
      },
      async listSpools() {
        return [
          {
            id: 11,
            filament: { id: 42 },
            extra: { tag: encodeExtraString("UID-1") }
          }
        ];
      },
      updateSpool: patch
    });
    const ctx = buildContext([slot()]);
    await syncSlot(ctx, "AC12", 0, 0, () => client);
    const patchArg = (patch.mock.calls[0]! as unknown as [number, {
      used_weight: number;
      last_used: string;
      first_used?: string;
    }])[1];
    expect(typeof patchArg.first_used).toBe("string");
  });

  it("auto-creates the filament when not in Spoolman", async () => {
    const createFilament = vi.fn(async () => ({ id: 99 }) as SpoolmanFilament);
    const client = fakeClient({
      async findFilamentByExternalId() {
        return null;
      },
      createFilamentFromExternal: createFilament,
      async listSpools() {
        return [];
      }
    });
    const ctx = buildContext([slot()]);
    const outcome = await syncSlot(ctx, "AC12", 0, 0, () => client);
    expect(createFilament).toHaveBeenCalledWith("bambulab_pla_matte_darkblue");
    expect(outcome.created_filament).toBe(true);
    expect(outcome.created_spool).toBe(true);
  });

  it("matches an existing spool whose tag was stored raw (legacy)", async () => {
    const client = fakeClient({
      async findFilamentByExternalId() {
        return { id: 42 };
      },
      async listSpools() {
        return [{ id: 5, filament: { id: 42 }, extra: { tag: "UID-1" } }];
      }
    });
    const ctx = buildContext([slot()]);
    const outcome = await syncSlot(ctx, "AC12", 0, 0, () => client);
    expect(outcome.spool_id).toBe(5);
    expect(outcome.created_spool).toBe(false);
  });

  it("rejects when Spoolman URL is not configured", async () => {
    const ctx = buildContext([slot()]);
    ctx.config = {
      ...ctx.config,
      spoolman: { auto_sync: false }
    };
    await expect(
      syncSlot(ctx, "AC12", 0, 0, () => fakeClient())
    ).rejects.toThrow(/not configured/);
  });

  it("rejects when the slot is not matched", async () => {
    const ctx = buildContext([slot({ tray_id_name: "A18-B0" })]);
    await expect(
      syncSlot(ctx, "AC12", 0, 0, () => fakeClient())
    ).rejects.toThrow(/not_matched/);
  });

  it("records a success in ctx.syncState", async () => {
    const client = fakeClient({
      async findFilamentByExternalId() {
        return { id: 42 };
      },
      async listSpools() {
        return [];
      }
    });
    const ctx = buildContext([slot()]);
    await syncSlot(ctx, "AC12", 0, 0, () => client);
    const view = getSlotSyncView(ctx.syncState, slot());
    expect(view.status).toBe("synced");
  });

  it("records an error in ctx.syncState when sync throws", async () => {
    const client = fakeClient({
      async findFilamentByExternalId() {
        throw new Error("network down");
      }
    });
    const ctx = buildContext([slot()]);
    await expect(
      syncSlot(ctx, "AC12", 0, 0, () => client)
    ).rejects.toThrow(/network down/);
    const view = getSlotSyncView(ctx.syncState, slot());
    expect(view.status).toBe("error");
    if (view.status === "error") expect(view.error).toMatch(/network down/);
  });

  it("rejects when tray_uuid is missing", async () => {
    const ctx = buildContext([slot({ tray_uuid: null })]);
    await expect(
      syncSlot(ctx, "AC12", 0, 0, () => fakeClient())
    ).rejects.toThrow(/missing_tray_uuid/);
  });
});

describe("syncAll", () => {
  it("separates synced slots from skipped slots", async () => {
    const patch = vi.fn(async (id: number) => ({
      id,
      filament: { id: 42 }
    }) as SpoolmanSpool);
    const client = fakeClient({
      async findFilamentByExternalId() {
        return { id: 42 };
      },
      async listSpools() {
        return [];
      },
      updateSpool: patch
    });
    const ctx = buildContext([
      slot({ ams_id: 0, slot_id: 0 }),
      slot({ ams_id: 0, slot_id: 1, tray_id_name: "X99-Z9" }),
      slot({ ams_id: 0, slot_id: 2, tray_uuid: null })
    ]);
    const result = await syncAll(ctx, () => client);
    expect(result.synced).toHaveLength(1);
    expect(result.skipped).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.skipped.map((s) => s.reason).sort()).toEqual([
      "missing_tray_uuid",
      "not_matched"
    ]);
  });

  it("collects errors without aborting the rest", async () => {
    let calls = 0;
    const client = fakeClient({
      async findFilamentByExternalId() {
        calls += 1;
        if (calls === 1) throw new Error("boom");
        return { id: 42 };
      },
      async listSpools() {
        return [];
      }
    });
    const ctx = buildContext([
      slot({ ams_id: 0, slot_id: 0 }),
      slot({ ams_id: 0, slot_id: 1, tray_uuid: "UID-2" })
    ]);
    const result = await syncAll(ctx, () => client);
    expect(result.errors).toHaveLength(1);
    expect(result.synced).toHaveLength(1);
    expect(result.errors[0].error).toMatch(/boom/);
  });
});

describe("createSpoolmanClient (fetch wrapper)", () => {
  it("normalizes trailing slashes and parses responses", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ version: "0.21.0" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    const client = createSpoolmanClient(
      "http://spoolman.local///",
      fetchMock as unknown as typeof fetch
    );
    const info = await client.getInfo();
    expect(info.version).toBe("0.21.0");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://spoolman.local/api/v1/info",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("throws a descriptive error on non-2xx responses", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("bad filament", { status: 400, statusText: "Bad Request" })
    );
    const client = createSpoolmanClient(
      "http://spoolman.local",
      fetchMock as unknown as typeof fetch
    );
    await expect(client.getInfo()).rejects.toThrow(
      /Spoolman GET \/api\/v1\/info failed: 400 Bad Request — bad filament/
    );
  });

  it("registers the tag field, then POSTs the encoded extra tag on spool creation", async () => {
    const calls: Array<[string, RequestInit]> = [];
    const fetchMock = (async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return new Response(
        JSON.stringify({ id: 1, filament: { id: 42 } }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const client = createSpoolmanClient("http://spoolman.local", fetchMock);
    await client.createSpool(42, "UID-9");
    await client.createSpool(42, "UID-10");

    // 1st call registers the field, 2nd creates the spool,
    // 3rd skips registration (memoized) and creates again.
    expect(calls).toHaveLength(3);
    expect(calls[0][0]).toBe("http://spoolman.local/api/v1/field/spool/tag");
    expect(JSON.parse(calls[0][1].body as string)).toEqual({
      name: "Tag",
      field_type: "text"
    });

    expect(calls[1][0]).toBe("http://spoolman.local/api/v1/spool");
    const spoolBody = JSON.parse(calls[1][1].body as string);
    expect(spoolBody.filament_id).toBe(42);
    expect(spoolBody.extra).toEqual({ tag: '"UID-9"' });
    expect(typeof spoolBody.first_used).toBe("string");
    expect(typeof spoolBody.last_used).toBe("string");

    // Second createSpool must not re-register the field.
    expect(calls[2][0]).toBe("http://spoolman.local/api/v1/spool");
  });
});
