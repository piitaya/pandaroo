import { describe, expect, it, beforeEach } from "vitest";
import { createTestDb } from "../test-helpers/db.js";
import { createSpoolRepository, type SpoolRepository } from "./spool.repository.js";
import {
  createSpoolHistoryRepository,
  type SpoolHistoryRepository,
} from "./spool-history.repository.js";

let spoolRepo: SpoolRepository;
let historyRepo: SpoolHistoryRepository;

beforeEach(() => {
  const { db } = createTestDb();
  spoolRepo = createSpoolRepository(db);
  historyRepo = createSpoolHistoryRepository(db);
  spoolRepo.create({
    tagId: "TAG-1",
    variantId: "A01-B6",
    material: "PLA",
    product: null,
    colorHex: null,
    colorHexes: null,
    weight: 1000,
    remain: 80,
    tempMin: null,
    tempMax: null,
    lastUsed: null,
    firstSeen: "2024-01-01T00:00:00.000Z",
    lastUpdated: "2024-01-01T00:00:00.000Z",
  });
});

describe("SpoolHistoryRepository.insertIfChanged", () => {
  function baseEvent() {
    return {
      tagId: "TAG-1",
      eventType: "ams_update" as const,
      printerSerial: "P1",
      amsId: 0,
      slotId: 1,
      remain: 80,
      weight: 800,
    };
  }

  it("inserts when shouldInsert returns true", () => {
    const inserted = historyRepo.insertIfChanged(baseEvent(), () => true);
    expect(inserted).toBe(true);
    expect(historyRepo.findLatest("TAG-1")).toBeDefined();
  });

  it("skips when shouldInsert returns false", () => {
    const inserted = historyRepo.insertIfChanged(baseEvent(), () => false);
    expect(inserted).toBe(false);
    expect(historyRepo.findLatest("TAG-1")).toBeUndefined();
  });

  it("passes the current latest row to the predicate", () => {
    historyRepo.insert(baseEvent());
    let observed: unknown;
    historyRepo.insertIfChanged({ ...baseEvent(), remain: 70 }, (latest) => {
      observed = latest;
      return true;
    });
    expect(observed).toBeDefined();
    expect((observed as { remain: number }).remain).toBe(80);
  });

  it("foreign key cascades on spool delete", () => {
    historyRepo.insert(baseEvent());
    expect(historyRepo.findLatest("TAG-1")).toBeDefined();
    spoolRepo.delete("TAG-1");
    expect(historyRepo.findLatest("TAG-1")).toBeUndefined();
  });

  it("stores event_type verbatim", () => {
    historyRepo.insert({ ...baseEvent(), eventType: "ams_load" });
    historyRepo.insert({ ...baseEvent(), eventType: "scan" });
    const rows = historyRepo.list("TAG-1", { limit: 10 });
    expect(rows.map((r) => r.eventType)).toContain("ams_load");
    expect(rows.map((r) => r.eventType)).toContain("scan");
  });
});
