import { EventEmitter } from "node:events";
import type { SpoolReading, PrinterConfig, PrinterStatus, Config } from "@bambu-spoolman-sync/shared";
import type { ParsedAmsUnit } from "./clients/bambu/types.js";

export interface SlotLocation {
  printer_serial: string;
  ams_id: number;
  slot_id: number;
}

export interface SpoolChangeSet {
  created: boolean;
  identity: boolean;
  remain: boolean;
  lastUsed: boolean;
  location: boolean;
}

// Subset of SpoolChangeSet fields that Spoolman itself stores. `identity` and
// `location` are AMS-only metadata, so they don't warrant a sync round-trip.
export const SYNC_RELEVANT_CHANGES: ReadonlyArray<keyof SpoolChangeSet> = [
  "created",
  "remain",
  "lastUsed",
];

export function shouldTriggerSync(changes: SpoolChangeSet): boolean {
  return SYNC_RELEVANT_CHANGES.some((k) => changes[k]);
}

export interface AppEvents {
  "spool:updated": [tagId: string, changes: SpoolChangeSet];
  "spool:scanned": [tagId: string];
  "spool:adjusted": [tagId: string];
  "spool:detected": [spool: SpoolReading & { tag_id: string }, location: SlotLocation];
  "spool:slot-exited": [tagId: string, location: SlotLocation];
  "ams:reported": [printer: PrinterConfig, amsUnits: ParsedAmsUnit[]];
  "printer:status-changed": [printer: PrinterConfig, status: PrinterStatus];
  "config:changed": [config: Config];
}

export type AppEventBus = {
  on<K extends keyof AppEvents>(event: K, handler: (...args: AppEvents[K]) => void): void;
  off<K extends keyof AppEvents>(event: K, handler: (...args: AppEvents[K]) => void): void;
  emit<K extends keyof AppEvents>(event: K, ...args: AppEvents[K]): void;
};

export function createEventBus(): AppEventBus {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(20);
  return {
    on: (event, handler) => emitter.on(event, handler),
    off: (event, handler) => emitter.off(event, handler),
    emit: (event, ...args) => emitter.emit(event, ...args),
  };
}
