import type { FastifyBaseLogger } from "fastify";
import type {
  SpoolHistoryEvent,
  SpoolHistoryKind,
  SpoolHistorySource,
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

export interface SpoolHistoryService {
  start(): void;
  stop(): void;
  list(tagId: string, options: ListHistoryOptions): SpoolHistoryEvent[];
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
    source: row.source,
    kind: row.kind,
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
    source: SpoolHistorySource;
    kind: SpoolHistoryKind;
    location: SlotLocation | null;
    remain: number | null;
    weight: number | null;
  }) {
    const { tagId, source, kind, location, remain, weight } = args;

    if (kind === "update") {
      const last = historyRepo.findLatest(tagId);
      if (last) {
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

        if (sameSlot && !remainChanged && !weightChanged) {
          return;
        }
      }
    }

    historyRepo.insert({
      tagId,
      source,
      kind,
      printerSerial: location?.printer_serial ?? null,
      amsId: location?.ams_id ?? null,
      slotId: location?.slot_id ?? null,
      remain,
      weight,
    });
  }

  function snapshotFromSpool(tagId: string): { remain: number | null; weight: number | null; location: SlotLocation | null } {
    const row = spoolRepo.findByTagId(tagId);
    if (!row) return { remain: null, weight: null, location: null };
    const location =
      row.lastPrinterSerial != null && row.lastAmsId != null && row.lastSlotId != null
        ? {
            printer_serial: row.lastPrinterSerial,
            ams_id: row.lastAmsId,
            slot_id: row.lastSlotId,
          }
        : null;
    return { remain: row.remain, weight: row.weight, location };
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
    const stillInPlace = last?.kind !== "slot_exit" && sameSlot;
    const kind: SpoolHistoryKind = stillInPlace ? "update" : "slot_enter";

    writeIfMeaningful({
      tagId: spool.tag_id,
      source: "ams",
      kind,
      location,
      remain: spool.remain ?? null,
      weight: spool.weight ?? null,
    });
  };

  const onSlotExited = (tagId: string, location: SlotLocation) => {
    const snap = snapshotFromSpool(tagId);
    historyRepo.insert({
      tagId,
      source: "ams",
      kind: "slot_exit",
      printerSerial: location.printer_serial,
      amsId: location.ams_id,
      slotId: location.slot_id,
      remain: snap.remain,
      weight: snap.weight,
    });
  };

  const onScanned = (tagId: string) => {
    const snap = snapshotFromSpool(tagId);
    writeIfMeaningful({
      tagId,
      source: "scan",
      kind: "update",
      location: snap.location,
      remain: snap.remain,
      weight: snap.weight,
    });
  };

  const onAdjusted = (tagId: string) => {
    const snap = snapshotFromSpool(tagId);
    // Manual adjustments are always recorded — the user explicitly changed something.
    historyRepo.insert({
      tagId,
      source: "manual",
      kind: "update",
      printerSerial: snap.location?.printer_serial ?? null,
      amsId: snap.location?.ams_id ?? null,
      slotId: snap.location?.slot_id ?? null,
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
  };
}
