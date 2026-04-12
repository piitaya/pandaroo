import { EventEmitter } from "node:events";
import type { SpoolData, Printer, PrinterStatus } from "@bambu-spoolman-sync/shared";
import type { AmsUnit } from "./clients/bambu.client.js";

export interface AppEvents {
  "spool:changed": [tagId: string];
  "slot:changed": [spool: SpoolData & { uid: string }];
  "ams:update": [printer: Printer, amsUnits: AmsUnit[]];
  "printer:status": [printer: Printer, status: PrinterStatus];
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
