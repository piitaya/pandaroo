import type { Config } from "@bambu-spoolman-sync/shared";
import type { AppEventBus } from "../events.js";
import { syncByTagIds, type SyncDeps } from "../spoolman-sync.js";

interface Logger {
  warn(obj: object, msg: string): void;
}

export interface SpoolmanSyncListener {
  start(): void;
  stop(): void;
}

export interface SpoolmanSyncListenerDeps {
  createSyncDeps: () => SyncDeps;
  bus: AppEventBus;
  log: Logger;
  getConfig: () => Config;
}

export function createSpoolmanSyncListener(
  deps: SpoolmanSyncListenerDeps,
): SpoolmanSyncListener {
  const pendingSync = new Set<string>();
  let debounceTimer: NodeJS.Timeout | null = null;

  const onSpoolUpdated = (tagId: string) => {
    const config = deps.getConfig();
    if (!config.spoolman.auto_sync || !config.spoolman.url) return;

    pendingSync.add(tagId);

    if (debounceTimer) return;

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const tagIds = [...pendingSync];
      pendingSync.clear();

      syncByTagIds(deps.createSyncDeps(), tagIds).catch((err) => {
        deps.log.warn({ err }, "spoolman sync failed");
      });
    }, 2000);
  };

  return {
    start() {
      deps.bus.on("spool:updated", onSpoolUpdated);
    },
    stop() {
      deps.bus.off("spool:updated", onSpoolUpdated);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = null;
      pendingSync.clear();
    },
  };
}
