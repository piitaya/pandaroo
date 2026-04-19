import { describe, expect, it, beforeEach } from "vitest";
import type { SpoolReading } from "@bambu-spoolman-sync/shared";
import { createTestDb } from "../test-helpers/db.js";
import { createTestLogger } from "../test-helpers/logger.js";
import { createSpoolRepository } from "../db/spool.repository.js";
import { createSyncStateRepository } from "../db/sync-state.repository.js";
import {
  createEventBus,
  type AppEventBus,
  type SpoolChangeSet,
} from "../events.js";
import { createSpoolService, type SpoolService } from "./spool.service.js";
import type { Mapping } from "../filament-catalog.js";

const mapping: Mapping = {
  get byId() {
    return new Map();
  },
  get fetchedAt() {
    return null;
  },
  async refresh() {
    return 0;
  },
  setInterval() {},
  stop() {},
};

function baseReading(overrides: Partial<SpoolReading> = {}): SpoolReading {
  return {
    tag_id: "TAG-1",
    variant_id: "A01-B6",
    material: "PLA",
    product: "PLA Matte",
    color_hex: "042F56FF",
    color_hexes: null,
    weight: 1000,
    temp_min: 200,
    temp_max: 230,
    remain: 80,
    ...overrides,
  };
}

let service: SpoolService;
let bus: AppEventBus;
let updates: Array<[string, SpoolChangeSet]>;

beforeEach(() => {
  const { db } = createTestDb();
  const spoolRepo = createSpoolRepository(db);
  const syncStateRepo = createSyncStateRepository(db);
  bus = createEventBus();
  updates = [];
  bus.on("spool:updated", (tagId, changes) => updates.push([tagId, changes]));
  service = createSpoolService({
    spoolRepo,
    syncStateRepo,
    mapping,
    bus,
    log: createTestLogger(),
  });
});

describe("SpoolService.upsert", () => {
  it("marks new spool as created and emits change set", () => {
    service.upsert(baseReading(), { source: "ams" });
    expect(updates).toHaveLength(1);
    const [tagId, changes] = updates[0]!;
    expect(tagId).toBe("TAG-1");
    expect(changes.created).toBe(true);
    expect(changes.remain).toBe(true);
  });

  it("AMS source overwrites remain with incoming null — state fields are authoritative", () => {
    service.upsert(baseReading({ remain: 80 }), { source: "ams" });
    service.upsert(baseReading({ remain: null }), { source: "ams" });
    const spool = service.findByTagId("TAG-1")!;
    expect(spool.remain).toBeNull();
  });

  it("scan source preserves remain when scan doesn't carry it", () => {
    service.upsert(baseReading({ remain: 80 }), { source: "ams" });
    service.upsert(baseReading({ remain: null }), { source: "scan" });
    const spool = service.findByTagId("TAG-1")!;
    expect(spool.remain).toBe(80);
  });

  it("merge-preserves identity fields when AMS reports null", () => {
    service.upsert(baseReading({ material: "PLA" }), { source: "ams" });
    service.upsert(baseReading({ material: null }), { source: "ams" });
    const spool = service.findByTagId("TAG-1")!;
    expect(spool.material).toBe("PLA");
  });

  it("does not emit spool:updated when nothing changed", () => {
    service.upsert(baseReading(), { source: "ams" });
    updates.length = 0;
    service.upsert(baseReading(), { source: "ams" });
    expect(updates).toHaveLength(0);
  });

  it("flags only `remain` in changes when only remain changed", () => {
    service.upsert(baseReading({ remain: 80 }), { source: "ams" });
    updates.length = 0;
    service.upsert(baseReading({ remain: 70 }), { source: "ams" });
    expect(updates).toHaveLength(1);
    const changes = updates[0]![1];
    expect(changes.remain).toBe(true);
  });

  it("persists identity-only changes but doesn't flag them for sync", () => {
    service.upsert(baseReading({ material: "PLA" }), { source: "ams" });
    updates.length = 0;
    service.upsert(baseReading({ material: "PETG" }), { source: "ams" });
    expect(updates).toHaveLength(1);
    const changes = updates[0]![1];
    // Material change alone produces no sync-relevant flags.
    expect(changes.created).toBe(false);
    expect(changes.remain).toBe(false);
    expect(changes.lastUsed).toBe(false);
    // But the row is still persisted.
    expect(service.findByTagId("TAG-1")!.material).toBe("PETG");
  });

  it("emits spool:scanned on scan source", () => {
    const scanned: string[] = [];
    bus.on("spool:scanned", (tagId) => scanned.push(tagId));
    service.upsert(baseReading(), { source: "scan" });
    expect(scanned).toEqual(["TAG-1"]);
  });

  it("still emits spool:scanned when upsert is a no-op", () => {
    service.upsert(baseReading(), { source: "scan" });
    const scanned: string[] = [];
    bus.on("spool:scanned", (tagId) => scanned.push(tagId));
    service.upsert(baseReading(), { source: "scan" });
    expect(scanned).toEqual(["TAG-1"]);
  });

  it("sets lastUpdated to a fresh ISO on each write (auto-bumped by Drizzle)", () => {
    service.upsert(baseReading(), { source: "ams" });
    const first = service.findByTagId("TAG-1")!.last_updated;
    // Wait a tick so the auto-bumped timestamp advances.
    const waited = new Promise((r) => setTimeout(r, 5));
    return waited.then(() => {
      service.upsert(baseReading({ remain: 50 }), { source: "ams" });
      const second = service.findByTagId("TAG-1")!.last_updated;
      expect(second > first).toBe(true);
    });
  });
});

describe("SpoolService.patch", () => {
  beforeEach(() => {
    service.upsert(baseReading({ remain: 80 }), { source: "ams" });
    updates.length = 0;
  });

  it("emits changes with only remain:true when remain changes", () => {
    service.patch("TAG-1", { remain: 60 });
    expect(updates).toHaveLength(1);
    const changes = updates[0]![1];
    expect(changes.remain).toBe(true);
    expect(changes.created).toBe(false);
  });

  it("emits spool:adjusted for history recording", () => {
    const adjusted: string[] = [];
    bus.on("spool:adjusted", (tagId) => adjusted.push(tagId));
    service.patch("TAG-1", { remain: 60 });
    expect(adjusted).toEqual(["TAG-1"]);
  });

  it("returns undefined for non-existent spool", () => {
    expect(service.patch("MISSING", { remain: 50 })).toBeUndefined();
  });
});

describe("SpoolService.delete", () => {
  it("returns true when a spool was deleted", () => {
    service.upsert(baseReading(), { source: "ams" });
    expect(service.delete("TAG-1")).toBe(true);
    expect(service.findByTagId("TAG-1")).toBeUndefined();
  });

  it("returns false when nothing matched", () => {
    expect(service.delete("MISSING")).toBe(false);
  });
});
