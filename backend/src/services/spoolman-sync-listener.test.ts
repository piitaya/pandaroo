import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createSpoolmanSyncListener } from "./spoolman-sync-listener.js";
import { createEventBus, type AppEventBus, type SpoolChangeSet } from "../events.js";
import type { Config } from "@bambu-spoolman-sync/shared";
import { createTestLogger } from "../test-helpers/logger.js";

vi.mock("../spoolman-sync.js", () => ({
  syncByTagIds: vi.fn().mockResolvedValue({ synced: [], skipped: [], errors: [] }),
}));

import { syncByTagIds } from "../spoolman-sync.js";

const baseConfig: Config = {
  printers: [],
  filament_catalog: { refresh_interval_hours: 24 },
  spoolman: { url: "http://localhost:7912", auto_sync: true, archive_on_empty: false },
};

const stubSyncStateRepo = {
  markSynced: vi.fn(),
  markError: vi.fn(),
  findByTagId: vi.fn(),
  listAll: vi.fn(() => []),
  listErrored: vi.fn(() => []),
};

function changes(partial: Partial<SpoolChangeSet> = {}): SpoolChangeSet {
  return {
    created: false,
    identity: false,
    remain: true, // default: a sync-relevant change
    lastUsed: false,
    location: false,
    ...partial,
  };
}

let bus: AppEventBus;

beforeEach(() => {
  vi.useFakeTimers();
  bus = createEventBus();
  vi.mocked(syncByTagIds).mockClear();
  stubSyncStateRepo.listErrored.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SpoolmanSyncListener", () => {
  it("batches multiple spool:updated events into one sync call", () => {
    const listener = createSpoolmanSyncListener({
      createSyncDeps: () => ({}) as any,
      syncStateRepo: stubSyncStateRepo as any,
      bus,
      log: createTestLogger(),
      getConfig: () => baseConfig,
    });
    listener.start();

    bus.emit("spool:updated", "TAG-1", changes());
    bus.emit("spool:updated", "TAG-2", changes());
    bus.emit("spool:updated", "TAG-1", changes()); // duplicate

    expect(syncByTagIds).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2000);

    expect(syncByTagIds).toHaveBeenCalledOnce();
    const tagIds = vi.mocked(syncByTagIds).mock.calls[0][1];
    expect(tagIds).toEqual(["TAG-1", "TAG-2"]);

    listener.stop();
  });

  it("does not sync when auto_sync is disabled", () => {
    const disabledConfig = {
      ...baseConfig,
      spoolman: { ...baseConfig.spoolman, auto_sync: false },
    };
    const listener = createSpoolmanSyncListener({
      createSyncDeps: () => ({}) as any,
      syncStateRepo: stubSyncStateRepo as any,
      bus,
      log: createTestLogger(),
      getConfig: () => disabledConfig,
    });
    listener.start();

    bus.emit("spool:updated", "TAG-1", changes());
    vi.advanceTimersByTime(2000);

    expect(syncByTagIds).not.toHaveBeenCalled();

    listener.stop();
  });

  it("skips sync when only identity or location changed", () => {
    const listener = createSpoolmanSyncListener({
      createSyncDeps: () => ({}) as any,
      syncStateRepo: stubSyncStateRepo as any,
      bus,
      log: createTestLogger(),
      getConfig: () => baseConfig,
    });
    listener.start();

    bus.emit("spool:updated", "TAG-1", changes({ remain: false, location: true }));
    bus.emit("spool:updated", "TAG-2", changes({ remain: false, identity: true }));
    vi.advanceTimersByTime(2000);

    expect(syncByTagIds).not.toHaveBeenCalled();

    // But a remain change does trigger sync.
    bus.emit("spool:updated", "TAG-3", changes({ remain: true }));
    vi.advanceTimersByTime(2000);
    expect(syncByTagIds).toHaveBeenCalledOnce();
    expect(vi.mocked(syncByTagIds).mock.calls[0][1]).toEqual(["TAG-3"]);

    listener.stop();
  });

  it("stop() clears pending syncs and unsubscribes", () => {
    const listener = createSpoolmanSyncListener({
      createSyncDeps: () => ({}) as any,
      syncStateRepo: stubSyncStateRepo as any,
      bus,
      log: createTestLogger(),
      getConfig: () => baseConfig,
    });
    listener.start();

    bus.emit("spool:updated", "TAG-1", changes());
    listener.stop();

    vi.advanceTimersByTime(2000);
    expect(syncByTagIds).not.toHaveBeenCalled();

    // After stop, new events should not trigger sync
    bus.emit("spool:updated", "TAG-2", changes());
    vi.advanceTimersByTime(2000);
    expect(syncByTagIds).not.toHaveBeenCalled();
  });

  it("periodically retries errored spools", () => {
    stubSyncStateRepo.listErrored.mockReturnValue([
      { tagId: "ERR-1", spoolmanSpoolId: null, lastSynced: null, lastSyncError: "boom" },
    ]);
    const listener = createSpoolmanSyncListener({
      createSyncDeps: () => ({}) as any,
      syncStateRepo: stubSyncStateRepo as any,
      bus,
      log: createTestLogger(),
      getConfig: () => baseConfig,
    });
    listener.start();

    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(syncByTagIds).toHaveBeenCalledOnce();
    expect(vi.mocked(syncByTagIds).mock.calls[0][1]).toEqual(["ERR-1"]);

    listener.stop();
  });
});
