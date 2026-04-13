import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createSpoolmanSyncListener } from "./spoolman-sync-listener.js";
import { createEventBus, type AppEventBus } from "../events.js";
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

let bus: AppEventBus;

beforeEach(() => {
  vi.useFakeTimers();
  bus = createEventBus();
  vi.mocked(syncByTagIds).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SpoolmanSyncListener", () => {
  it("batches multiple spool:updated events into one sync call", () => {
    const listener = createSpoolmanSyncListener({
      createSyncDeps: () => ({} as any),
      bus,
      log: createTestLogger(),
      getConfig: () => baseConfig,
    });
    listener.start();

    bus.emit("spool:updated", "TAG-1");
    bus.emit("spool:updated", "TAG-2");
    bus.emit("spool:updated", "TAG-1"); // duplicate

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
      createSyncDeps: () => ({} as any),
      bus,
      log: createTestLogger(),
      getConfig: () => disabledConfig,
    });
    listener.start();

    bus.emit("spool:updated", "TAG-1");
    vi.advanceTimersByTime(2000);

    expect(syncByTagIds).not.toHaveBeenCalled();

    listener.stop();
  });

  it("stop() clears pending syncs and unsubscribes", () => {
    const listener = createSpoolmanSyncListener({
      createSyncDeps: () => ({} as any),
      bus,
      log: createTestLogger(),
      getConfig: () => baseConfig,
    });
    listener.start();

    bus.emit("spool:updated", "TAG-1");
    listener.stop();

    vi.advanceTimersByTime(2000);
    expect(syncByTagIds).not.toHaveBeenCalled();

    // After stop, new events should not trigger sync
    bus.emit("spool:updated", "TAG-2");
    vi.advanceTimersByTime(2000);
    expect(syncByTagIds).not.toHaveBeenCalled();
  });
});
