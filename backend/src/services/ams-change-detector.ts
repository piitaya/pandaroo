import type { FastifyBaseLogger } from "fastify";
import type { SpoolReading } from "@bambu-spoolman-sync/shared";
import type { ParsedSlot, ParsedAmsUnit } from "../clients/bambu/types.js";
import type { AppEventBus, SlotLocation } from "../events.js";

function slotKey(slot: ParsedSlot): string {
  return `${slot.printer_serial}|${slot.ams_id}|${slot.slot_id}`;
}

function slotSignature(slot: ParsedSlot): string {
  const s = slot.spool;
  return `${s?.tag_id}|${s?.remain}|${s?.weight}`;
}

function slotLocation(slot: ParsedSlot): SlotLocation {
  return {
    printer_serial: slot.printer_serial,
    ams_id: slot.ams_id,
    slot_id: slot.slot_id,
  };
}

export interface AmsChangeDetector {
  start(): void;
  stop(): void;
}

export function createAmsChangeDetector(bus: AppEventBus, log: FastifyBaseLogger): AmsChangeDetector {
  const lastSignature = new Map<string, string>();
  const lastTagByKey = new Map<string, string>();

  const onAmsReported = (_printer: unknown, ams_units: ParsedAmsUnit[]) => {
    for (const unit of ams_units) {
      for (const slot of unit.slots) {
        const key = slotKey(slot);

        if (!slot.spool?.tag_id) {
          const previousTag = lastTagByKey.get(key);
          if (previousTag) {
            log.debug(
              { printerSerial: slot.printer_serial, amsId: slot.ams_id, slotId: slot.slot_id, tagId: previousTag },
              "AMS slot emptied",
            );
            bus.emit("spool:slot-exited", previousTag, slotLocation(slot));
          }
          lastSignature.delete(key);
          lastTagByKey.delete(key);
          continue;
        }

        const sig = slotSignature(slot);
        if (lastSignature.get(key) === sig) continue;

        const previousTag = lastTagByKey.get(key);
        if (previousTag && previousTag !== slot.spool.tag_id) {
          // A different spool replaced the previous one — emit exit for the old.
          bus.emit("spool:slot-exited", previousTag, slotLocation(slot));
        }

        lastSignature.set(key, sig);
        lastTagByKey.set(key, slot.spool.tag_id);

        log.debug(
          { printerSerial: slot.printer_serial, amsId: slot.ams_id, slotId: slot.slot_id, tagId: slot.spool.tag_id },
          "AMS slot changed",
        );

        bus.emit(
          "spool:detected",
          slot.spool as SpoolReading & { tag_id: string },
          slotLocation(slot),
        );
      }
    }
  };

  return {
    start() {
      bus.on("ams:reported", onAmsReported);
    },
    stop() {
      bus.off("ams:reported", onAmsReported);
      lastSignature.clear();
      lastTagByKey.clear();
    },
  };
}
