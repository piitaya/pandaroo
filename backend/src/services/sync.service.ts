import { computeUsedWeight } from "../domain/spool.js";
import type { FilamentEntry } from "../domain/matcher.js";
import {
  type SpoolmanClient,
  type SpoolmanSpool,
  createSpoolmanClient,
  decodeExtraString,
} from "../clients/spoolman.client.js";
import type { SpoolRow, SpoolRepository } from "../db/spool.repository.js";
import type { SyncStateRepository } from "../db/sync-state.repository.js";
import { errorMessage } from "../utils.js";

export interface SpoolSyncResult {
  tag_id: string;
  spoolman_spool_id: number;
  created_filament: boolean;
  created_spool: boolean;
}

export interface SyncAllResult {
  synced: SpoolSyncResult[];
  skipped: Array<{ tag_id: string; reason: string }>;
  errors: Array<{ tag_id: string; error: string }>;
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

  const spoolmanSpools = allSpools ?? await client.listSpools();
  let spoolmanSpool =
    spoolmanSpools.find((s) => decodeExtraString(s.extra?.tag) === row.tagId) ?? null;
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
): Promise<SyncAllResult> {
  const client = clientFactory(deps.spoolmanUrl);
  const options = { archiveOnEmpty: deps.archiveOnEmpty };

  const allSpools = await client.listSpools();
  const result: SyncAllResult = { synced: [], skipped: [], errors: [] };

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
