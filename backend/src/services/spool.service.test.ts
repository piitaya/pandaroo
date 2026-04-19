import { describe, expect, it, beforeEach } from "vitest";
import type { SpoolReading } from "@bambu-spoolman-sync/shared";
import { createTestDb } from "../test-helpers/db.js";
import { createTestLogger } from "../test-helpers/logger.js";
import { createSpoolRepository } from "../db/spool.repository.js";
import { createSyncStateRepository } from "../db/sync-state.repository.js";
import { createEventBus, type AppEventBus } from "../events.js";
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
let updates: string[];

beforeEach(() => {
  const { db } = createTestDb();
  const spoolRepo = createSpoolRepository(db);
  const syncStateRepo = createSyncStateRepository(db);
  bus = createEventBus();
  updates = [];
  bus.on("spool:updated", (tagId) => updates.push(tagId));
  service = createSpoolService({
    spoolRepo,
    syncStateRepo,
    mapping,
    bus,
    log: createTestLogger(),
  });
});

describe("SpoolService.upsert", () => {
  it("marks new spool as created and emits spool:updated", () => {
    const result = service.upsert(baseReading(), { source: "ams" });
    expect(result?.created).toBe(true);
    expect(updates).toEqual(["TAG-1"]);
  });

  it("preserves remain when a new reading is null — null means 'could not measure'", () => {
    service.upsert(baseReading({ remain: 80 }), { source: "ams" });
    service.upsert(baseReading({ remain: null }), { source: "ams" });
    expect(service.findByTagId("TAG-1")!.remain).toBe(80);

    // Same semantics for scans.
    service.upsert(baseReading({ remain: null }), { source: "scan" });
    expect(service.findByTagId("TAG-1")!.remain).toBe(80);
  });

  it("overwrites remain with a numeric reading, including 0", () => {
    service.upsert(baseReading({ remain: 80 }), { source: "ams" });
    service.upsert(baseReading({ remain: 42 }), { source: "ams" });
    expect(service.findByTagId("TAG-1")!.remain).toBe(42);
    service.upsert(baseReading({ remain: 0 }), { source: "ams" });
    expect(service.findByTagId("TAG-1")!.remain).toBe(0);
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

  it("emits spool:updated when remain changes", () => {
    service.upsert(baseReading({ remain: 80 }), { source: "ams" });
    updates.length = 0;
    const result = service.upsert(baseReading({ remain: 70 }), { source: "ams" });
    expect(result?.created).toBe(false);
    expect(updates).toEqual(["TAG-1"]);
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

  it("emits spool:updated with the tag id", () => {
    service.patch("TAG-1", { remain: 60 });
    expect(updates).toEqual(["TAG-1"]);
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
