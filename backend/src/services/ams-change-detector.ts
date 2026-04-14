import type { FastifyBaseLogger } from "fastify";
import type { SpoolReading } from "@bambu-spoolman-sync/shared";
import type { ParsedSlot, ParsedAmsUnit } from "../clients/bambu/types.js";
import type { AppEventBus } from "../events.js";

function slotKey(slot: ParsedSlot): string {
  return `${slot.printer_serial}|${slot.ams_id}|${slot.slot_id}`;
}

function slotSignature(slot: ParsedSlot): string {
  const s = slot.spool;
  return `${s?.tag_id}|${s?.remain}|${s?.weight}`;
}

export interface AmsChangeDetector {
  start(): void;
  stop(): void;
}

export function createAmsChangeDetector(bus: AppEventBus, log: FastifyBaseLogger): AmsChangeDetector {
  const lastSignature = new Map<string, string>();

  const onAmsReported = (_printer: unknown, ams_units: ParsedAmsUnit[]) => {
    for (const unit of ams_units) {
      for (const slot of unit.slots) {
        const key = slotKey(slot);

        if (!slot.spool?.tag_id) {
          if (lastSignature.has(key)) {
            log.debug({ printerSerial: slot.printer_serial, amsId: slot.ams_id, slotId: slot.slot_id }, "AMS slot emptied");
          }
          lastSignature.delete(key);
          continue;
        }

        const sig = slotSignature(slot);
        if (lastSignature.get(key) === sig) continue;
        lastSignature.set(key, sig);

        log.debug({ printerSerial: slot.printer_serial, amsId: slot.ams_id, slotId: slot.slot_id, tagId: slot.spool.tag_id }, "AMS slot changed");

        bus.emit("spool:detected", slot.spool as SpoolReading & { tag_id: string }, {
          printer_serial: slot.printer_serial,
          ams_id: slot.ams_id,
          slot_id: slot.slot_id,
        });
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
    },
  };
}
