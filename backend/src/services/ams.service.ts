import type { SpoolData, AmsSlot } from "@bambu-spoolman-sync/shared";
import type { AppEventBus } from "../events.js";

function slotKey(slot: AmsSlot): string {
  return `${slot.printer_serial}|${slot.ams_id}|${slot.slot_id}`;
}

function slotSignature(slot: AmsSlot): string {
  const s = slot.spool;
  return `${s?.uid}|${s?.remain}|${s?.weight}`;
}

export function createAmsService(bus: AppEventBus): void {
  const lastSignature = new Map<string, string>();

  bus.on("ams:update", (_printer, ams_units) => {
    for (const unit of ams_units) {
      for (const slot of unit.slots) {
        const key = slotKey(slot);

        if (!slot.spool?.uid) {
          lastSignature.delete(key);
          continue;
        }

        const sig = slotSignature(slot);
        if (lastSignature.get(key) === sig) continue;
        lastSignature.set(key, sig);

        bus.emit("slot:changed", slot.spool as SpoolData & { uid: string });
      }
    }
  });
}
