import type { FastifyBaseLogger } from "fastify";
import type {
  SpoolHistoryEvent,
  SpoolHistoryEventType,
  SpoolReading,
} from "@bambu-spoolman-sync/shared";
import type { AppEventBus, SlotLocation } from "../events.js";
import type {
  ListHistoryOptions,
  SpoolHistoryRepository,
  SpoolHistoryRow,
} from "../db/spool-history.repository.js";
import type { SpoolRepository } from "../db/spool.repository.js";

const REMAIN_DELTA_THRESHOLD = 1;

export type UpdateHistoryEventResult =
  | { ok: true; event: SpoolHistoryEvent }
  | { ok: false; reason: "not_found" | "not_manual" | "tag_mismatch" };

export type DeleteHistoryEventResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "not_manual" | "tag_mismatch" };

export interface SpoolHistoryService {
  start(): void;
  stop(): void;
  list(tagId: string, options: ListHistoryOptions): SpoolHistoryEvent[];
  updateManual(
    tagId: string,
    eventId: number,
    patch: { remain: number | null },
  ): UpdateHistoryEventResult;
  deleteManual(tagId: string, eventId: number): DeleteHistoryEventResult;
}

export interface SpoolHistoryServiceDeps {
  historyRepo: SpoolHistoryRepository;
  spoolRepo: SpoolRepository;
  bus: AppEventBus;
  log: FastifyBaseLogger;
}

// SQLite `datetime('now')` returns UTC as "YYYY-MM-DD HH:MM:SS" without
// timezone suffix — JS parses that as local time. Normalize to ISO-8601 UTC.
function toIsoUtc(value: string): string {
  if (value.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(value)) return value;
  return `${value.replace(" ", "T")}Z`;
}

function rowToEvent(row: SpoolHistoryRow): SpoolHistoryEvent {
  return {
    id: row.id,
    tag_id: row.tagId,
    event_type: row.eventType,
    printer_serial: row.printerSerial,
    ams_id: row.amsId,
    slot_id: row.slotId,
    remain: row.remain,
    weight: row.weight,
    created_at: toIsoUtc(row.createdAt),
  };
}

export function createSpoolHistoryService(
  deps: SpoolHistoryServiceDeps,
): SpoolHistoryService {
  const { historyRepo, spoolRepo, bus, log } = deps;

  function writeIfMeaningful(args: {
    tagId: string;
    eventType: SpoolHistoryEventType;
    location: SlotLocation | null;
    remain: number | null;
    weight: number | null;
  }) {
    const { tagId, eventType, location, remain, weight } = args;

    historyRepo.insertIfChanged(
      {
        tagId,
        eventType,
        printerSerial: location?.printer_serial ?? null,
        amsId: location?.ams_id ?? null,
        slotId: location?.slot_id ?? null,
        remain,
        weight,
      },
      (last) => {
        if (eventType !== "ams_update") return true;
        if (!last) return true;
        const sameSlot =
          last.printerSerial === (location?.printer_serial ?? null) &&
          last.amsId === (location?.ams_id ?? null) &&
          last.slotId === (location?.slot_id ?? null);
        const remainDelta =
          last.remain != null && remain != null
            ? Math.abs(remain - last.remain)
            : null;
        const remainChanged =
          remainDelta == null
            ? last.remain !== remain
            : remainDelta >= REMAIN_DELTA_THRESHOLD;
        const weightChanged = (last.weight ?? null) !== (weight ?? null);
        return !sameSlot || remainChanged || weightChanged;
      },
    );
  }

  function snapshotFromSpool(tagId: string): { remain: number | null; weight: number | null } {
    const row = spoolRepo.findByTagId(tagId);
    if (!row) return { remain: null, weight: null };
    return { remain: row.remain, weight: row.weight };
  }

  // Keep Spool.remain aligned with the latest history event that carries a
  // remain value. Runs after history edits/deletes so corrections to the most
  // recent remain-bearing event also correct the spool's current state.
  // `lastUpdated` is auto-bumped by the Drizzle $onUpdate hook.
  function syncCurrentRemain(tagId: string) {
    const latest = historyRepo.findLatestWithRemain(tagId);
    const nextRemain = latest?.remain ?? null;
    const spool = spoolRepo.findByTagId(tagId);
    if (!spool) return;
    if (spool.remain === nextRemain) return;
    spoolRepo.update(tagId, { remain: nextRemain });
  }

  const onSpoolDetected = (
    spool: SpoolReading & { tag_id: string },
    location: SlotLocation,
  ) => {
    const last = historyRepo.findLatest(spool.tag_id);
    const sameSlot =
      last &&
      last.printerSerial === location.printer_serial &&
      last.amsId === location.ams_id &&
      last.slotId === location.slot_id;
    const stillInPlace = last?.eventType !== "ams_unload" && sameSlot;
    const eventType: SpoolHistoryEventType = stillInPlace ? "ams_update" : "ams_load";

    writeIfMeaningful({
      tagId: spool.tag_id,
      eventType,
      location,
      remain: spool.remain ?? null,
      weight: spool.weight ?? null,
    });
  };

  const onSlotExited = (tagId: string, location: SlotLocation) => {
    const snap = snapshotFromSpool(tagId);
    historyRepo.insert({
      tagId,
      eventType: "ams_unload",
      printerSerial: location.printer_serial,
      amsId: location.ams_id,
      slotId: location.slot_id,
      remain: snap.remain,
      weight: snap.weight,
    });
  };

  const onScanned = (tagId: string) => {
    const snap = snapshotFromSpool(tagId);
    historyRepo.insert({
      tagId,
      eventType: "scan",
      printerSerial: null,
      amsId: null,
      slotId: null,
      remain: snap.remain,
      weight: snap.weight,
    });
  };

  const onAdjusted = (tagId: string) => {
    const snap = snapshotFromSpool(tagId);
    historyRepo.insert({
      tagId,
      eventType: "adjust",
      printerSerial: null,
      amsId: null,
      slotId: null,
      remain: snap.remain,
      weight: snap.weight,
    });
  };

  return {
    start() {
      bus.on("spool:detected", onSpoolDetected);
      bus.on("spool:slot-exited", onSlotExited);
      bus.on("spool:scanned", onScanned);
      bus.on("spool:adjusted", onAdjusted);
      log.info("Spool history service started");
    },
    stop() {
      bus.off("spool:detected", onSpoolDetected);
      bus.off("spool:slot-exited", onSlotExited);
      bus.off("spool:scanned", onScanned);
      bus.off("spool:adjusted", onAdjusted);
    },
    list(tagId, options) {
      return historyRepo.list(tagId, options).map(rowToEvent);
    },

    updateManual(tagId, eventId, patch) {
      const row = historyRepo.findById(eventId);
      if (!row) return { ok: false, reason: "not_found" };
      if (row.tagId !== tagId) return { ok: false, reason: "tag_mismatch" };
      if (row.eventType !== "adjust") return { ok: false, reason: "not_manual" };
      const updated = historyRepo.updateRemain(eventId, patch.remain);
      if (!updated) return { ok: false, reason: "not_found" };
      syncCurrentRemain(tagId);
      return { ok: true, event: rowToEvent({ ...row, remain: patch.remain }) };
    },

    deleteManual(tagId, eventId) {
      const row = historyRepo.findById(eventId);
      if (!row) return { ok: false, reason: "not_found" };
      if (row.tagId !== tagId) return { ok: false, reason: "tag_mismatch" };
      if (row.eventType !== "adjust") return { ok: false, reason: "not_manual" };
      const deleted = historyRepo.deleteById(eventId);
      if (!deleted) return { ok: false, reason: "not_found" };
      syncCurrentRemain(tagId);
      return { ok: true };
    },
  };
}
