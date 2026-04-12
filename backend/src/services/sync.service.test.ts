import { describe, expect, it, vi } from "vitest";
import { syncByTagIds, type SyncDeps } from "./sync.service.js";
import {
  createSpoolmanClient,
  encodeExtraString,
  decodeExtraString,
  type SpoolmanClient,
  type SpoolmanFilament,
  type SpoolmanSpool,
} from "../clients/spoolman.client.js";
import type { FilamentEntry } from "../domain/matcher.js";
import type { AmsSlot } from "../domain/spool.js";
import { deriveSlotSyncView } from "../domain/sync-view.js";
import type { SpoolRow, SpoolRepository } from "../db/spool.repository.js";
import type {
  SpoolSyncStateRow,
  SyncStateRepository,
} from "../db/sync-state.repository.js";

const mapping = new Map<string, FilamentEntry>([
  ["A01-B6", { id: "A01-B6", spoolman_id: "bambulab_pla_matte_darkblue" }],
  ["A18-B0", { id: "A18-B0", spoolman_id: null }],
]);

function makeSpoolRow(over: Partial<SpoolRow> = {}): SpoolRow {
  return {
    tagId: "UID-1",
    variantId: "A01-B6",
    material: "PLA",
    product: "PLA Matte",
    colorHex: "042F56FF",
    weight: 1000,
    remain: 75,
    lastUsed: null,
    firstSeen: "2024-01-01T00:00:00",
    lastUpdated: "2024-01-01T00:00:00",
    ...over,
  };
}

function fakeSpoolRepo(rows: SpoolRow[]): SpoolRepository {
  return {
    create() {},
    update() {},
    delete() { return false; },
    findByTagId(tagId) {
      return rows.find((r) => r.tagId === tagId);
    },
    list() {
      return rows;
    },
  };
}

function fakeSyncStateRepo(): SyncStateRepository & {
  records: Map<string, SpoolSyncStateRow>;
} {
  const records = new Map<string, SpoolSyncStateRow>();
  return {
    records,
    markSynced(tagId, syncedAt, spoolmanSpoolId) {
      records.set(tagId, {
        tagId,
        spoolmanSpoolId,
        lastSynced: syncedAt,
        lastSyncError: null,
      });
    },
    markError(tagId, error) {
      const existing = records.get(tagId);
      records.set(tagId, {
        tagId,
        spoolmanSpoolId: existing?.spoolmanSpoolId ?? null,
        lastSynced: existing?.lastSynced ?? null,
        lastSyncError: error,
      });
    },
    findByTagId(tagId) {
      return records.get(tagId);
    },
    listAll() {
      return [...records.values()];
    },
  };
}

function buildDeps(rows: SpoolRow[], overrides?: Partial<SyncDeps>): SyncDeps {
  return {
    spoolRepo: fakeSpoolRepo(rows),
    syncStateRepo: fakeSyncStateRepo(),
    mapping,
    spoolmanUrl: "http://spoolman.local",
    archiveOnEmpty: false,
    ...overrides,
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
    async deleteSpool() {},
    ...over,
  };
}

// ---------- Helpers ----------

const slot = (
  overSpool?: Partial<AmsSlot["spool"]> | null,
  overSlot?: Partial<AmsSlot>,
): AmsSlot => ({
  printer_serial: "AC12",
  ams_id: 0,
  slot_id: 0,
  nozzle_id: 0,
  has_spool: true,
  spool: overSpool === null ? null : {
    uid: "UID-1",
    variant_id: "A01-B6",
    material: "PLA",
    product: "PLA Matte",
    color_hex: "042F56FF",
    color_hexes: null,
    weight: 1000,
    temp_min: 220,
    temp_max: 240,
    remain: 75,
    ...overSpool,
  },
  ...overSlot,
});

describe("encodeExtraString / decodeExtraString", () => {
  it("round-trips a value through JSON encoding", () => {
    expect(decodeExtraString(encodeExtraString("UID-1"))).toBe("UID-1");
  });
  it("decodes a raw string stored without JSON encoding", () => {
    expect(decodeExtraString("UID-1")).toBe("UID-1");
  });
  it("returns null for undefined input", () => {
    expect(decodeExtraString(undefined)).toBeNull();
  });
});

describe("deriveSlotSyncView", () => {
  it("returns never when sync row is absent", () => {
    expect(deriveSlotSyncView(slot(), makeSpoolRow(), undefined)).toEqual({
      status: "never",
    });
  });
  it("returns never when slot has no spool", () => {
    expect(
      deriveSlotSyncView(slot(null), undefined, undefined),
    ).toEqual({ status: "never" });
  });
  it("returns synced when lastSynced >= lastUpdated", () => {
    const spoolRow = makeSpoolRow({ lastUpdated: "2024-01-01T00:00:00Z" });
    const syncRow: SpoolSyncStateRow = {
      tagId: "UID-1",
      spoolmanSpoolId: 9,
      lastSynced: "2024-01-02T00:00:00Z",
      lastSyncError: null,
    };
    expect(deriveSlotSyncView(slot(), spoolRow, syncRow)).toEqual({
      status: "synced",
      spool_id: 9,
      at: "2024-01-02T00:00:00Z",
    });
  });
  it("returns stale when spool has been updated after last sync", () => {
    const spoolRow = makeSpoolRow({ lastUpdated: "2024-01-03T00:00:00Z" });
    const syncRow: SpoolSyncStateRow = {
      tagId: "UID-1",
      spoolmanSpoolId: 9,
      lastSynced: "2024-01-02T00:00:00Z",
      lastSyncError: null,
    };
    expect(deriveSlotSyncView(slot(), spoolRow, syncRow)).toEqual({
      status: "stale",
      spool_id: 9,
      at: "2024-01-02T00:00:00Z",
    });
  });
  it("returns error when lastSyncError is set", () => {
    const syncRow: SpoolSyncStateRow = {
      tagId: "UID-1",
      spoolmanSpoolId: 9,
      lastSynced: "2024-01-02T00:00:00Z",
      lastSyncError: "boom",
    };
    expect(deriveSlotSyncView(slot(), makeSpoolRow(), syncRow)).toEqual({
      status: "error",
      error: "boom",
    });
  });
});

describe("syncByTagIds", () => {
  it("syncs a matched spool", async () => {
    const patch = vi.fn(
      async (id: number) => ({ id, filament: { id: 42 } }) as SpoolmanSpool,
    );
    const client = fakeClient({
      async findFilamentByExternalId() { return { id: 42 }; },
      async listSpools() {
        return [{
          id: 9,
          filament: { id: 42 },
          first_used: "2024-01-01",
          extra: { tag: encodeExtraString("UID-1") },
        }];
      },
      updateSpool: patch,
    });
    const deps = buildDeps([makeSpoolRow()]);
    const r = await syncByTagIds(deps, ["UID-1"], () => client);
    expect(r.synced).toHaveLength(1);
    expect(r.synced[0]).toMatchObject({
      tag_id: "UID-1",
      spoolman_spool_id: 9,
    });
    expect(r.synced[0].created_spool).toBe(false);
  });

  it("auto-creates filament when not in Spoolman", async () => {
    const create = vi.fn(async () => ({ id: 99 }) as SpoolmanFilament);
    const client = fakeClient({
      async findFilamentByExternalId() { return null; },
      createFilamentFromExternal: create,
    });
    const deps = buildDeps([makeSpoolRow()]);
    const r = await syncByTagIds(deps, ["UID-1"], () => client);
    expect(create).toHaveBeenCalledWith("bambulab_pla_matte_darkblue");
    expect(r.synced[0]).toMatchObject({
      created_filament: true,
      created_spool: true,
    });
  });

  it("skips spools not in local DB", async () => {
    const deps = buildDeps([]);
    const r = await syncByTagIds(deps, ["MISSING"], () => fakeClient());
    expect(r.skipped).toEqual([{ tag_id: "MISSING", reason: "not_found" }]);
  });

  it("skips unmapped spools", async () => {
    const deps = buildDeps([makeSpoolRow({ variantId: "A18-B0" })]);
    const r = await syncByTagIds(deps, ["UID-1"], () => fakeClient());
    expect(r.skipped).toEqual([{ tag_id: "UID-1", reason: "not_matched" }]);
  });

  it("does not write sync state for skipped spools", async () => {
    const syncStateRepo = fakeSyncStateRepo();
    const deps = buildDeps([makeSpoolRow({ variantId: "A18-B0" })], {
      syncStateRepo,
    });
    await syncByTagIds(deps, ["UID-1", "MISSING"], () => fakeClient());
    expect(syncStateRepo.records.size).toBe(0);
  });

  it("marks sync state on success", async () => {
    const syncStateRepo = fakeSyncStateRepo();
    const client = fakeClient({
      async findFilamentByExternalId() { return { id: 42 }; },
      async listSpools() {
        return [{
          id: 9,
          filament: { id: 42 },
          first_used: "2024-01-01",
          extra: { tag: encodeExtraString("UID-1") },
        }];
      },
    });
    const deps = buildDeps([makeSpoolRow()], { syncStateRepo });
    await syncByTagIds(deps, ["UID-1"], () => client);
    const row = syncStateRepo.records.get("UID-1");
    expect(row?.spoolmanSpoolId).toBe(9);
    expect(row?.lastSynced).toBeTruthy();
    expect(row?.lastSyncError).toBeNull();
  });

  it("collects errors without aborting", async () => {
    let calls = 0;
    const client = fakeClient({
      async findFilamentByExternalId() {
        calls++;
        if (calls === 1) throw new Error("boom");
        return { id: 42 };
      },
    });
    const syncStateRepo = fakeSyncStateRepo();
    const deps = buildDeps(
      [
        makeSpoolRow({ tagId: "UID-1" }),
        makeSpoolRow({ tagId: "UID-2" }),
      ],
      { syncStateRepo },
    );
    const r = await syncByTagIds(deps, ["UID-1", "UID-2"], () => client);
    expect(r.errors).toHaveLength(1);
    expect(r.synced).toHaveLength(1);
    expect(syncStateRepo.records.get("UID-1")?.lastSyncError).toBe("boom");
    expect(syncStateRepo.records.get("UID-2")?.lastSyncError).toBeNull();
  });

  it("preserves last_synced when a subsequent sync fails", async () => {
    let succeed = true;
    const client = fakeClient({
      async findFilamentByExternalId() {
        if (!succeed) throw new Error("later failure");
        return { id: 42 };
      },
      async listSpools() {
        return [{
          id: 9,
          filament: { id: 42 },
          first_used: "2024-01-01",
          extra: { tag: encodeExtraString("UID-1") },
        }];
      },
    });
    const syncStateRepo = fakeSyncStateRepo();
    const deps = buildDeps([makeSpoolRow()], { syncStateRepo });
    await syncByTagIds(deps, ["UID-1"], () => client);
    const firstSynced = syncStateRepo.records.get("UID-1")?.lastSynced;
    expect(firstSynced).toBeTruthy();

    succeed = false;
    await syncByTagIds(deps, ["UID-1"], () => client);
    const row = syncStateRepo.records.get("UID-1");
    expect(row?.lastSyncError).toBe("later failure");
    expect(row?.lastSynced).toBe(firstSynced);
    expect(row?.spoolmanSpoolId).toBe(9);
  });

  it("archives spool when remain is 0 and archive_on_empty is true", async () => {
    const patch = vi.fn(
      async (id: number) => ({ id, filament: { id: 42 } }) as SpoolmanSpool,
    );
    const client = fakeClient({
      async findFilamentByExternalId() { return { id: 42 }; },
      async listSpools() {
        return [{
          id: 9,
          filament: { id: 42 },
          first_used: "2024-01-01",
          extra: { tag: encodeExtraString("UID-1") },
        }];
      },
      updateSpool: patch,
    });
    const deps = buildDeps([makeSpoolRow({ remain: 0 })], { archiveOnEmpty: true });
    await syncByTagIds(deps, ["UID-1"], () => client);
    const patchArg = (patch.mock.calls[0] as unknown as [number, Record<string, unknown>])[1];
    expect(patchArg.archived).toBe(true);
  });
});

describe("createSpoolmanClient", () => {
  it("strips trailing slashes from base URL", async () => {
    const f = vi.fn(
      async () =>
        new Response(JSON.stringify({ version: "0.21" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const c = createSpoolmanClient(
      "http://spoolman.local///",
      f as unknown as typeof fetch,
    );
    expect((await c.getInfo()).version).toBe("0.21");
    expect(f).toHaveBeenCalledWith(
      "http://spoolman.local/api/v1/info",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("throws on non-2xx response", async () => {
    const f = vi.fn(
      async () => new Response("bad", { status: 400, statusText: "Bad Request" }),
    );
    await expect(
      createSpoolmanClient("http://x", f as unknown as typeof fetch).getInfo(),
    ).rejects.toThrow(/400/);
  });

  it("registers extra.tag field before first spool creation, skips on subsequent", async () => {
    const calls: [string, RequestInit][] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return new Response(
        JSON.stringify({ id: 1, filament: { id: 42 } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;
    const c = createSpoolmanClient("http://s", f);
    await c.createSpool(42, "UID-9");
    await c.createSpool(42, "UID-10");
    expect(calls).toHaveLength(3);
    expect(calls[0][0]).toContain("/field/spool/tag");
    expect(calls[1][0]).toContain("/spool");
    expect(calls[2][0]).toContain("/spool");
  });
});
