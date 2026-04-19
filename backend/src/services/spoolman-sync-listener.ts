import type { FastifyBaseLogger } from "fastify";
import type { Config } from "@bambu-spoolman-sync/shared";
import type { AppEventBus, SpoolChangeSet } from "../events.js";
import { shouldTriggerSync } from "../events.js";
import type { SyncStateRepository } from "../db/sync-state.repository.js";
import { syncByTagIds, type SyncDeps } from "../spoolman-sync.js";

/** How often to retry spools stuck in the sync error state. */
const RETRY_INTERVAL_MS = 5 * 60 * 1000;

export interface SpoolmanSyncListener {
  start(): void;
  stop(): void;
}

export interface SpoolmanSyncListenerDeps {
  createSyncDeps: () => SyncDeps;
  syncStateRepo: SyncStateRepository;
  bus: AppEventBus;
  log: FastifyBaseLogger;
  getConfig: () => Config;
}

export function createSpoolmanSyncListener(
  deps: SpoolmanSyncListenerDeps,
): SpoolmanSyncListener {
  const pendingSync = new Set<string>();
  let debounceTimer: NodeJS.Timeout | null = null;
  let retryTimer: NodeJS.Timeout | null = null;

  const onSpoolUpdated = (tagId: string, changes: SpoolChangeSet) => {
    const config = deps.getConfig();
    if (!config.spoolman.auto_sync || !config.spoolman.url) return;

    // Skip if nothing Spoolman would care about changed — identity/location-only
    // diffs don't need to re-push the spool.
    if (!shouldTriggerSync(changes)) {
      deps.log.debug({ tagId, changes }, "Spool update irrelevant to Spoolman, skipping sync");
      return;
    }

    deps.log.debug({ tagId, changes }, "Spool update queued for sync");
    pendingSync.add(tagId);

    if (debounceTimer) return;

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const tagIds = [...pendingSync];
      pendingSync.clear();

      deps.log.debug({ tagCount: tagIds.length }, "Auto-syncing spools");
      syncByTagIds(deps.createSyncDeps(), tagIds).catch((err) => {
        deps.log.warn({ err }, "Spoolman sync failed");
      });
    }, 2000);
  };

  const retryErroredSpools = () => {
    const config = deps.getConfig();
    if (!config.spoolman.auto_sync || !config.spoolman.url) return;

    const errored = deps.syncStateRepo.listErrored();
    if (errored.length === 0) return;

    const tagIds = errored.map((r) => r.tagId);
    deps.log.info(
      { tagCount: tagIds.length },
      "Retrying errored Spoolman syncs",
    );
    syncByTagIds(deps.createSyncDeps(), tagIds).catch((err) => {
      deps.log.warn({ err }, "Spoolman retry sync failed");
    });
  };

  return {
    start() {
      deps.bus.on("spool:updated", onSpoolUpdated);
      retryTimer = setInterval(retryErroredSpools, RETRY_INTERVAL_MS);
      retryTimer.unref?.();
    },
    stop() {
      deps.bus.off("spool:updated", onSpoolUpdated);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = null;
      if (retryTimer) clearInterval(retryTimer);
      retryTimer = null;
      pendingSync.clear();
    },
  };
}
