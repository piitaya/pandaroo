import type { AppEventBus } from "../events.js";
import { syncByTagIds, type SyncDeps } from "../sync.js";

interface Logger {
  warn(obj: object, msg: string): void;
}

export interface SpoolmanSyncConfig {
  autoSync: boolean;
  url?: string;
}

export function createSpoolmanSync(
  deps: SyncDeps,
  getConfig: () => SpoolmanSyncConfig,
  log: Logger,
  bus: AppEventBus,
) {
  const pendingSync = new Set<string>();
  let debounceTimer: NodeJS.Timeout | null = null;

  const onSpoolChanged = (tagId: string) => {
    const config = getConfig();
    if (!config.autoSync || !config.url) return;

    pendingSync.add(tagId);

    if (debounceTimer) return;

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const tagIds = [...pendingSync];
      pendingSync.clear();

      syncByTagIds(deps, tagIds).catch((err) => {
        log.warn({ err }, "spoolman sync failed");
      });
    }, 2000);
  };

  bus.on("spool:changed", onSpoolChanged);

  const stop = () => {
    bus.off("spool:changed", onSpoolChanged);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
    pendingSync.clear();
  };

  return { stop };
}
