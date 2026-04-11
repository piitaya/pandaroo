import type { AmsSlot, AmsUnit, Spool } from "../domain/spool.js";

export type SlotChangeListener = (spool: Spool & { uid: string }) => void;

export interface AmsService {
  onAmsUpdate(ams_units: AmsUnit[]): void;
  setChangeListener(listener: SlotChangeListener | null): void;
}

function slotKey(slot: AmsSlot): string {
  return `${slot.printer_serial}|${slot.ams_id}|${slot.slot_id}`;
}

function slotSignature(slot: AmsSlot): string {
  const s = slot.spool;
  return `${s?.uid}|${s?.remain}|${s?.weight}`;
}

export function createAmsService(): AmsService {
  let listener: SlotChangeListener | null = null;
  const lastSignature = new Map<string, string>();

  return {
    onAmsUpdate(ams_units) {
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

          listener?.(slot.spool as Spool & { uid: string });
        }
      }
    },

    setChangeListener(l) {
      listener = l;
    },
  };
}
