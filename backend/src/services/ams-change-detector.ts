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

interface LastSeen {
  tagId: string;
  signature: string;
}

export function createAmsChangeDetector(bus: AppEventBus, log: FastifyBaseLogger): AmsChangeDetector {
  const lastBySlot = new Map<string, LastSeen>();

  // So the next AMS report re-emits `spool:detected` after a manual adjust.
  const onSpoolAdjusted = (tagId: string) => {
    for (const [key, last] of lastBySlot) {
      if (last.tagId === tagId) lastBySlot.delete(key);
    }
  };

  const onAmsReported = (_printer: unknown, ams_units: ParsedAmsUnit[]) => {
    for (const unit of ams_units) {
      for (const slot of unit.slots) {
        const key = slotKey(slot);
        const previous = lastBySlot.get(key);

        if (!slot.spool?.tag_id) {
          if (previous) {
            log.debug(
              { printerSerial: slot.printer_serial, amsId: slot.ams_id, slotId: slot.slot_id, tagId: previous.tagId },
              "AMS slot emptied",
            );
            bus.emit("spool:slot-exited", previous.tagId, slotLocation(slot));
            lastBySlot.delete(key);
          }
          continue;
        }

        const signature = slotSignature(slot);
        if (previous?.signature === signature) continue;

        if (previous && previous.tagId !== slot.spool.tag_id) {
          // A different spool replaced the previous one — emit exit for the old.
          bus.emit("spool:slot-exited", previous.tagId, slotLocation(slot));
        }

        lastBySlot.set(key, { tagId: slot.spool.tag_id, signature });

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
      bus.on("spool:adjusted", onSpoolAdjusted);
    },
    stop() {
      bus.off("ams:reported", onAmsReported);
      bus.off("spool:adjusted", onSpoolAdjusted);
      lastBySlot.clear();
    },
  };
}
