import type { FastifyBaseLogger } from "fastify";
import type { CatalogEntry, SpoolSyncResult, SyncResult } from "@bambu-spoolman-sync/shared";
import {
  type SpoolmanClient,
  type SpoolmanSpool,
  createSpoolmanClient,
} from "./clients/spoolman.client.js";
import type { SpoolRow, SpoolRepository } from "./db/spool.repository.js";
import type { SyncStateRepository } from "./db/sync-state.repository.js";
import { errorMessage } from "./routes/schemas.js";

function computeUsedWeight(weight: number, remain: number): number {
  return Math.max(0, weight * (1 - remain / 100));
}

export interface SyncDeps {
  spoolRepo: SpoolRepository;
  syncStateRepo: SyncStateRepository;
  mapping: Map<string, CatalogEntry>;
  spoolmanUrl: string;
  archiveOnEmpty: boolean;
  log: FastifyBaseLogger;
}

async function syncOneSpool(
  client: SpoolmanClient,
  row: SpoolRow,
  spoolmanId: string,
  options: { archiveOnEmpty: boolean },
  knownSpoolmanSpoolId: number | null,
  listSpoolsLazy: () => Promise<SpoolmanSpool[]>,
): Promise<SpoolSyncResult> {
  let createdFilament = false;
  let filament = await client.findFilamentByExternalId(spoolmanId);
  if (!filament) {
    filament = await client.createFilamentFromExternal(spoolmanId);
    createdFilament = true;
  }

  let spoolmanSpool: SpoolmanSpool | null = null;
  if (knownSpoolmanSpoolId != null) {
    spoolmanSpool = await client.getSpool(knownSpoolmanSpoolId);
  }
  if (!spoolmanSpool) {
    spoolmanSpool = await client.findSpoolByTag(row.tagId, await listSpoolsLazy());
  }
  let createdSpool = false;
  if (!spoolmanSpool) {
    spoolmanSpool = await client.createSpool(filament.id, row.tagId);
    createdSpool = true;
  }

  let usedWeight: number | null = null;
  if (row.weight != null && row.remain != null && row.weight > 0) {
    usedWeight = computeUsedWeight(row.weight, row.remain);
  }

  const shouldArchive = options.archiveOnEmpty && row.remain === 0;
  await client.updateSpool(spoolmanSpool.id, {
    ...(usedWeight != null ? { used_weight: usedWeight } : {}),
    ...(row.lastUsed ? { last_used: row.lastUsed } : {}),
    ...(spoolmanSpool.first_used ? {} : { first_used: row.firstSeen }),
    ...(shouldArchive ? { archived: true } : {}),
  });

  return {
    tag_id: row.tagId,
    spoolman_spool_id: spoolmanSpool.id,
    created_filament: createdFilament,
    created_spool: createdSpool,
  };
}

function resolveSpoolmanId(
  row: SpoolRow,
  mapping: Map<string, CatalogEntry>,
): string | null {
  if (!row.variantId) return null;
  const entry = mapping.get(row.variantId);
  return entry?.spoolman_id ?? null;
}

let syncQueue: Promise<unknown> = Promise.resolve();

export function syncByTagIds(
  deps: SyncDeps,
  tagIds: string[],
  clientFactory: (url: string) => SpoolmanClient = createSpoolmanClient,
): Promise<SyncResult> {
  const next = syncQueue
    .catch(() => {})
    .then(() => runSync(deps, tagIds, clientFactory));
  syncQueue = next.catch(() => {});
  return next;
}

async function runSync(
  deps: SyncDeps,
  tagIds: string[],
  clientFactory: (url: string) => SpoolmanClient,
): Promise<SyncResult> {
  const { log } = deps;
  const client = clientFactory(deps.spoolmanUrl);
  const options = { archiveOnEmpty: deps.archiveOnEmpty };

  log.debug({ tagCount: tagIds.length }, "Starting Spoolman sync");

  // Prefetch sync state once for all requested tags instead of N lookups in the loop.
  const knownIds = new Map<string, number | null>();
  for (const row of deps.syncStateRepo.listAll()) {
    knownIds.set(row.tagId, row.spoolmanSpoolId);
  }

  // Defer the full list-spools fetch until something actually misses the
  // short-path — sync-all still pays it once, but single-tag syncs of known
  // spools skip it entirely.
  let allSpoolsPromise: Promise<SpoolmanSpool[]> | null = null;
  const listSpoolsLazy = () =>
    (allSpoolsPromise ??= client.listSpools());

  const result: SyncResult = { synced: [], skipped: [], errors: [] };

  for (const tagId of tagIds) {
    const row = deps.spoolRepo.findByTagId(tagId);
    if (!row) {
      log.warn({ tagId, reason: "not_found" }, "Spool skipped");
      result.skipped.push({ tag_id: tagId, reason: "not_found" });
      continue;
    }

    const spoolmanId = resolveSpoolmanId(row, deps.mapping);
    if (!spoolmanId) {
      log.warn({ tagId, reason: "not_matched" }, "Spool skipped");
      result.skipped.push({ tag_id: tagId, reason: "not_matched" });
      continue;
    }

    try {
      const outcome = await syncOneSpool(
        client,
        row,
        spoolmanId,
        options,
        knownIds.get(tagId) ?? null,
        listSpoolsLazy,
      );
      result.synced.push(outcome);
      deps.syncStateRepo.markSynced(
        tagId,
        new Date().toISOString(),
        outcome.spoolman_spool_id,
      );
      log.debug({ tagId, spoolmanSpoolId: outcome.spoolman_spool_id }, "Spool synced");
    } catch (err) {
      const message = errorMessage(err);
      result.errors.push({ tag_id: tagId, error: message });
      deps.syncStateRepo.markError(tagId, message);
      log.warn({ tagId, err: message }, "Spool sync failed");
    }
  }

  log.debug({ synced: result.synced.length, skipped: result.skipped.length, errors: result.errors.length }, "Sync complete");
  return result;
}
