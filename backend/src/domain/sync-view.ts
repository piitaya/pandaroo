import type { AmsSlot } from "./spool.js";
import type { SpoolRow } from "../db/spool.repository.js";
import type { SpoolSyncStateRow } from "../db/sync-state.repository.js";

export type SlotSyncView =
  | { status: "never" }
  | { status: "synced"; spool_id: number; at: string }
  | { status: "stale"; spool_id: number; at: string }
  | { status: "error"; error: string };

export function deriveSlotSyncView(
  slot: AmsSlot,
  spoolRow: SpoolRow | undefined,
  syncRow: SpoolSyncStateRow | undefined,
): SlotSyncView {
  const uid = slot.spool?.uid;
  if (!uid || !syncRow) return { status: "never" };

  if (syncRow.lastSyncError) {
    return { status: "error", error: syncRow.lastSyncError };
  }

  if (syncRow.lastSynced == null || syncRow.spoolmanSpoolId == null) {
    return { status: "never" };
  }

  const lastUpdated = spoolRow?.lastUpdated;
  const isStale = lastUpdated != null && lastUpdated > syncRow.lastSynced;

  return {
    status: isStale ? "stale" : "synced",
    spool_id: syncRow.spoolmanSpoolId,
    at: syncRow.lastSynced,
  };
}
