import type { FilamentEntry, SpoolSyncResult, SyncResult } from "@bambu-spoolman-sync/shared";
import {
  type SpoolmanClient,
  type SpoolmanSpool,
  createSpoolmanClient,
} from "./clients/spoolman.client.js";
import type { SpoolRow, SpoolRepository } from "./db/spool.repository.js";
import type { SyncStateRepository } from "./db/sync-state.repository.js";

function computeUsedWeight(weight: number, remain: number): number {
  return Math.max(0, weight * (1 - remain / 100));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface SyncDeps {
  spoolRepo: SpoolRepository;
  syncStateRepo: SyncStateRepository;
  mapping: Map<string, FilamentEntry>;
  spoolmanUrl: string;
  archiveOnEmpty: boolean;
}

async function syncOneSpool(
  client: SpoolmanClient,
  row: SpoolRow,
  spoolmanId: string,
  options: { archiveOnEmpty: boolean },
  allSpools?: SpoolmanSpool[],
): Promise<SpoolSyncResult> {
  let createdFilament = false;
  let filament = await client.findFilamentByExternalId(spoolmanId);
  if (!filament) {
    filament = await client.createFilamentFromExternal(spoolmanId);
    createdFilament = true;
  }

  let spoolmanSpool = await client.findSpoolByTag(row.tagId, allSpools);
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
  mapping: Map<string, FilamentEntry>,
): string | null {
  if (!row.variantId) return null;
  const entry = mapping.get(row.variantId);
  return entry?.spoolman_id ?? null;
}

export async function syncByTagIds(
  deps: SyncDeps,
  tagIds: string[],
  clientFactory: (url: string) => SpoolmanClient = createSpoolmanClient,
): Promise<SyncResult> {
  const client = clientFactory(deps.spoolmanUrl);
  const options = { archiveOnEmpty: deps.archiveOnEmpty };

  const allSpools = await client.listSpools();
  const result: SyncResult = { synced: [], skipped: [], errors: [] };

  for (const tagId of tagIds) {
    const row = deps.spoolRepo.findByTagId(tagId);
    if (!row) {
      result.skipped.push({ tag_id: tagId, reason: "not_found" });
      continue;
    }

    const spoolmanId = resolveSpoolmanId(row, deps.mapping);
    if (!spoolmanId) {
      result.skipped.push({ tag_id: tagId, reason: "not_matched" });
      continue;
    }

    try {
      const outcome = await syncOneSpool(client, row, spoolmanId, options, allSpools);
      result.synced.push(outcome);
      deps.syncStateRepo.markSynced(
        tagId,
        new Date().toISOString(),
        outcome.spoolman_spool_id,
      );
    } catch (err) {
      const message = errorMessage(err);
      result.errors.push({ tag_id: tagId, error: message });
      deps.syncStateRepo.markError(tagId, message);
    }
  }

  return result;
}
