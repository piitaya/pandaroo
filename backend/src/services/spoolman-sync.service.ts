import { syncByTagIds, type SyncDeps } from "./sync.service.js";

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
) {
  const pendingSync = new Set<string>();
  let debounceTimer: NodeJS.Timeout | null = null;

  const onSpoolChange = (tagId: string) => {
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

  const stop = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
    pendingSync.clear();
  };

  return { onSpoolChange, stop };
}
