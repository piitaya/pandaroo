import type { FastifyBaseLogger } from "fastify";
import type { PrinterConfig } from "@bambu-spoolman-sync/shared";
import type { AppEventBus } from "../../events.js";
import { connect, type InternalClient, type PrinterRuntime } from "./connection.js";

export type PrinterConnectionPool = Map<string, InternalClient>;

export function createPrinterConnectionPool(): PrinterConnectionPool {
  return new Map();
}

export function syncPrinters(
  target: PrinterConfig[],
  state: PrinterConnectionPool,
  bus: AppEventBus,
  log: FastifyBaseLogger,
): void {
  const wanted = new Map(
    target.filter((p) => p.enabled).map((p) => [p.serial, p]),
  );

  for (const [serial, client] of state) {
    const next = wanted.get(serial);
    const changed =
      !next ||
      client.printer.host !== next.host ||
      client.printer.access_code !== next.access_code;
    if (changed) {
      log.info({ serial }, "Disconnecting printer (config changed)");
      client.disconnect().catch(() => {});
      state.delete(serial);
    } else {
      client.printer = next;
    }
  }

  for (const printer of wanted.values()) {
    if (state.has(printer.serial)) continue;
    state.set(printer.serial, connect(printer, bus, log));
  }
}

export function listRuntimes(state: PrinterConnectionPool): PrinterRuntime[] {
  return Array.from(state.values()).map((c) => ({
    printer: c.printer,
    status: c.status,
    ams_units: c.ams_units,
    disconnect: c.disconnect,
  }));
}

export async function disconnectAll(state: PrinterConnectionPool): Promise<void> {
  await Promise.all(Array.from(state.values()).map((c) => c.disconnect()));
  state.clear();
}
