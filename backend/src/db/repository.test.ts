import { describe, expect, it, beforeEach } from "vitest";
import { createTestDb } from "../test-helpers/db.js";
import { createSpoolRepository, type SpoolRepository } from "./spool.repository.js";
import { createSyncStateRepository, type SyncStateRepository } from "./sync-state.repository.js";
import type { AppDatabase } from "./database.js";

let db: AppDatabase;
let spoolRepo: SpoolRepository;
let syncStateRepo: SyncStateRepository;

beforeEach(() => {
  const testDb = createTestDb();
  db = testDb.db;
  spoolRepo = createSpoolRepository(db);
  syncStateRepo = createSyncStateRepository(db);
});

describe("SpoolRepository", () => {
  const baseSpool = {
    tagId: "TAG-1",
    variantId: "A01-B6",
    material: "PLA",
    product: "PLA Matte",
    colorHex: "042F56FF",
    colorHexes: null,
    weight: 1000,
    remain: 80,
    tempMin: null,
    tempMax: null,
    lastUsed: null,
    firstSeen: "2024-01-01T00:00:00.000Z",
    lastUpdated: "2024-01-01T00:00:00.000Z",
  };

  it("creates and retrieves a spool", () => {
    spoolRepo.create(baseSpool);
    const row = spoolRepo.findByTagId("TAG-1");
    expect(row).toBeDefined();
    expect(row!.tagId).toBe("TAG-1");
    expect(row!.material).toBe("PLA");
    expect(row!.weight).toBe(1000);
  });

  it("returns undefined for non-existent tag", () => {
    expect(spoolRepo.findByTagId("MISSING")).toBeUndefined();
  });

  it("updates a spool", () => {
    spoolRepo.create(baseSpool);
    spoolRepo.update("TAG-1", { remain: 50, lastUpdated: "2024-02-01T00:00:00.000Z" });
    const row = spoolRepo.findByTagId("TAG-1");
    expect(row!.remain).toBe(50);
    expect(row!.lastUpdated).toBe("2024-02-01T00:00:00.000Z");
  });

  it("deletes a spool and returns true", () => {
    spoolRepo.create(baseSpool);
    expect(spoolRepo.delete("TAG-1")).toBe(true);
    expect(spoolRepo.findByTagId("TAG-1")).toBeUndefined();
  });

  it("returns false when deleting non-existent spool", () => {
    expect(spoolRepo.delete("MISSING")).toBe(false);
  });

  it("lists spools ordered by lastUpdated DESC", () => {
    spoolRepo.create({ ...baseSpool, tagId: "A", lastUpdated: "2024-01-01T00:00:00.000Z" });
    spoolRepo.create({ ...baseSpool, tagId: "B", lastUpdated: "2024-03-01T00:00:00.000Z" });
    spoolRepo.create({ ...baseSpool, tagId: "C", lastUpdated: "2024-02-01T00:00:00.000Z" });
    const tags = spoolRepo.list().map((r) => r.tagId);
    expect(tags).toEqual(["B", "C", "A"]);
  });
});

describe("SyncStateRepository", () => {
  const baseSpool = {
    tagId: "TAG-1",
    variantId: "A01-B6",
    material: "PLA",
    product: "PLA Matte",
    colorHex: "042F56FF",
    colorHexes: null,
    weight: 1000,
    remain: 80,
    tempMin: null,
    tempMax: null,
    lastUsed: null,
    firstSeen: "2024-01-01T00:00:00.000Z",
    lastUpdated: "2024-01-01T00:00:00.000Z",
  };

  it("marks a spool as synced", () => {
    spoolRepo.create(baseSpool);
    syncStateRepo.markSynced("TAG-1", "2024-01-15T10:00:00.000Z", 42);
    const row = syncStateRepo.findByTagId("TAG-1");
    expect(row).toBeDefined();
    expect(row!.spoolmanSpoolId).toBe(42);
    expect(row!.lastSynced).toBe("2024-01-15T10:00:00.000Z");
    expect(row!.lastSyncError).toBeNull();
  });

  it("updates sync state on subsequent markSynced", () => {
    spoolRepo.create(baseSpool);
    syncStateRepo.markSynced("TAG-1", "2024-01-15T10:00:00.000Z", 42);
    syncStateRepo.markSynced("TAG-1", "2024-02-01T10:00:00.000Z", 42);
    const row = syncStateRepo.findByTagId("TAG-1");
    expect(row!.lastSynced).toBe("2024-02-01T10:00:00.000Z");
  });

  it("markError preserves spoolmanSpoolId and lastSynced from previous sync", () => {
    spoolRepo.create(baseSpool);
    syncStateRepo.markSynced("TAG-1", "2024-01-15T10:00:00.000Z", 42);
    syncStateRepo.markError("TAG-1", "network timeout");
    const row = syncStateRepo.findByTagId("TAG-1");
    expect(row!.lastSyncError).toBe("network timeout");
    expect(row!.spoolmanSpoolId).toBe(42);
    expect(row!.lastSynced).toBe("2024-01-15T10:00:00.000Z");
  });

  it("cascade deletes sync state when spool is deleted", () => {
    spoolRepo.create(baseSpool);
    syncStateRepo.markSynced("TAG-1", "2024-01-15T10:00:00.000Z", 42);
    spoolRepo.delete("TAG-1");
    expect(syncStateRepo.findByTagId("TAG-1")).toBeUndefined();
  });

  it("returns undefined for non-existent tag", () => {
    expect(syncStateRepo.findByTagId("MISSING")).toBeUndefined();
  });
});
