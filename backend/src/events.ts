import { EventEmitter } from "node:events";
import type { SpoolReading, PrinterConfig, PrinterStatus, Config } from "@bambu-spoolman-sync/shared";
import type { ParsedAmsUnit } from "./clients/bambu/types.js";

export interface AppEvents {
  "spool:updated": [tagId: string];
  "spool:detected": [spool: SpoolReading & { tag_id: string }, location: { printer_serial: string; ams_id: number; slot_id: number }];
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
