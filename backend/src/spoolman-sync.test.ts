import { describe, expect, it, vi } from "vitest";
import { createTestLogger } from "./test-helpers/logger.js";
import { syncByTagIds, type SyncDeps } from "./spoolman-sync.js";
import {
  createSpoolmanClient,
  encodeExtraString,
  decodeExtraString,
  type SpoolmanClient,
  type SpoolmanFilament,
  type SpoolmanSpool,
} from "./clients/spoolman.client.js";
import type { CatalogEntry } from "./filament-catalog.js";
import { deriveSyncState } from "./services/spool.service.js";
import type { SpoolRow, SpoolRepository } from "./db/spool.repository.js";
import type {
  SpoolSyncStateRow,
  SyncStateRepository,
} from "./db/sync-state.repository.js";

const mapping = new Map<string, CatalogEntry>([
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
    colorHexes: null,
    weight: 1000,
    remain: 75,
    tempMin: null,
    tempMax: null,
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
    log: createTestLogger(),
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
    async getSpool() { return null; },
    async ensureSpoolTagField() {},
    async findSpoolByTag(_tag, spools) {
      const list = spools ?? await this.listSpools();
      return list.find((s) => decodeExtraString(s.extra?.tag) === _tag) ?? null;
    },
    async createSpool() { return { id: 7, filament: { id: 42 } } as SpoolmanSpool; },
    async updateSpool(id) { return { id, filament: { id: 42 } } as SpoolmanSpool; },
    async deleteSpool() {},
    ...over,
  };
}


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

describe("deriveSyncState", () => {
  it("returns never when sync row is absent", () => {
    expect(deriveSyncState(makeSpoolRow(), undefined)).toEqual({
      status: "never",
    });
  });
  it("returns never when no spool row and no sync row", () => {
    expect(deriveSyncState(undefined, undefined)).toEqual({
      status: "never",
    });
  });
  it("returns synced when lastSynced >= lastUpdated", () => {
    const spoolRow = makeSpoolRow({ lastUpdated: "2024-01-01T00:00:00Z" });
    const syncRow: SpoolSyncStateRow = {
      tagId: "UID-1",
      spoolmanSpoolId: 9,
      lastSynced: "2024-01-02T00:00:00Z",
      lastSyncError: null,
    };
    expect(deriveSyncState(spoolRow, syncRow)).toEqual({
      status: "synced",
      spoolman_spool_id: 9,
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
    expect(deriveSyncState(spoolRow, syncRow)).toEqual({
      status: "stale",
      spoolman_spool_id: 9,
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
    expect(deriveSyncState(makeSpoolRow(), syncRow)).toEqual({
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

  it("writes used_weight on create, computed from remain%", async () => {
    const patch = vi.fn(
      async (id: number) => ({ id, filament: { id: 42 } }) as SpoolmanSpool,
    );
    const client = fakeClient({
      async findFilamentByExternalId() { return { id: 42 }; },
      updateSpool: patch,
    });
    const deps = buildDeps([makeSpoolRow({ weight: 1000, remain: 60 })]);
    await syncByTagIds(deps, ["UID-1"], () => client);
    expect(patch).toHaveBeenCalledTimes(1);
    // 1000g capacity * (1 - 0.6) = 400g used.
    expect(patch.mock.calls[0][1]).toMatchObject({ used_weight: 400 });
  });

  it("keeps used_weight in sync on subsequent syncs", async () => {
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
    const deps = buildDeps([makeSpoolRow({ weight: 1000, remain: 30 })]);
    await syncByTagIds(deps, ["UID-1"], () => client);
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch.mock.calls[0][1]).toMatchObject({ used_weight: 700 });
  });

  it("skips used_weight when we don't know capacity or remain", async () => {
    const patch = vi.fn(
      async (id: number) => ({ id, filament: { id: 42 } }) as SpoolmanSpool,
    );
    const client = fakeClient({
      async findFilamentByExternalId() { return { id: 42 }; },
      updateSpool: patch,
    });
    const deps = buildDeps([makeSpoolRow({ weight: null, remain: 50 })]);
    await syncByTagIds(deps, ["UID-1"], () => client);
    expect(patch.mock.calls[0][1]).not.toHaveProperty("used_weight");
  });

  it("uses stored spoolman_spool_id as a short-path lookup", async () => {
    const getSpool = vi.fn(async (id: number) => ({
      id,
      filament: { id: 42 },
      first_used: "2024-01-01",
    } as SpoolmanSpool));
    const findByTag = vi.fn(async () => null);
    const client = fakeClient({
      async findFilamentByExternalId() { return { id: 42 }; },
      getSpool,
      findSpoolByTag: findByTag,
    });
    const syncStateRepo = fakeSyncStateRepo();
    // Pretend we've synced this tag before: id is cached.
    syncStateRepo.markSynced("UID-1", "2024-01-10T00:00:00.000Z", 123);
    const deps = buildDeps([makeSpoolRow()], { syncStateRepo });
    await syncByTagIds(deps, ["UID-1"], () => client);
    expect(getSpool).toHaveBeenCalledWith(123);
    expect(findByTag).not.toHaveBeenCalled();
  });

  it("falls back to tag scan when the cached Spoolman id is missing on the server", async () => {
    const getSpool = vi.fn(async () => null);
    const findByTag = vi.fn(
      async () => ({
        id: 7,
        filament: { id: 42 },
        first_used: "2024-01-01",
      }) as SpoolmanSpool,
    );
    const client = fakeClient({
      async findFilamentByExternalId() { return { id: 42 }; },
      getSpool,
      findSpoolByTag: findByTag,
    });
    const syncStateRepo = fakeSyncStateRepo();
    syncStateRepo.markSynced("UID-1", "2024-01-10T00:00:00.000Z", 999);
    const deps = buildDeps([makeSpoolRow()], { syncStateRepo });
    const r = await syncByTagIds(deps, ["UID-1"], () => client);
    expect(getSpool).toHaveBeenCalledWith(999);
    expect(findByTag).toHaveBeenCalled();
    expect(r.synced[0].spoolman_spool_id).toBe(7);
  });

  it("serializes overlapping sync calls through a single queue", async () => {
    // Two parallel calls must not execute concurrently — otherwise both would
    // race on find-or-create filament/spool and produce duplicates. The mutex
    // guarantees the second one's `listSpools` starts after the first finishes.
    const order: string[] = [];
    let aResolve!: () => void;
    const aDone = new Promise<void>((resolve) => {
      aResolve = resolve;
    });
    const client = fakeClient({
      async findFilamentByExternalId() { return { id: 42 }; },
      async listSpools() {
        order.push("list:start");
        // First caller blocks here until we resolve.
        if (order.filter((s) => s === "list:start").length === 1) {
          await aDone;
        }
        order.push("list:end");
        return [];
      },
    });
    const deps = buildDeps([makeSpoolRow()]);
    const first = syncByTagIds(deps, ["UID-1"], () => client);
    const second = syncByTagIds(deps, ["UID-1"], () => client);
    // Give the first call a tick to start.
    await new Promise((r) => setTimeout(r, 5));
    expect(order).toEqual(["list:start"]); // second is still queued
    aResolve();
    await Promise.all([first, second]);
    // listSpools ran twice (once per call), never interleaved.
    expect(order).toEqual([
      "list:start",
      "list:end",
      "list:start",
      "list:end",
    ]);
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
    expect(patch).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ archived: true }),
    );
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
