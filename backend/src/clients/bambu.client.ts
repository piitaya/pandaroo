import mqtt, { type MqttClient } from "mqtt";
import type { SpoolData, AmsSlot, Printer, PrinterErrorCode, PrinterStatus } from "@bambu-spoolman-sync/shared";
import type { AppEventBus } from "../events.js";

export interface AmsUnit {
  id: number;
  nozzle_id: number | null;
  slots: AmsSlot[];
}

function toSpoolData(tray: unknown): SpoolData | null {
  const t = tray as Record<string, unknown> | null;

  const rawUuid = t?.tray_uuid as string | undefined;
  const uid = rawUuid && !/^0+$/.test(rawUuid) ? rawUuid : null;

  const rawCols = t?.cols;
  const colorHexes = Array.isArray(rawCols)
    ? (rawCols as unknown[]).filter((c): c is string => typeof c === "string")
    : null;

  const hasInfo =
    !!uid || !!t?.tray_id_name || !!t?.tray_type || !!t?.tray_sub_brands;
  if (!hasInfo) return null;

  const rawWeight = (t?.tray_weight as string) ?? null;
  const weight = rawWeight && rawWeight !== "0" ? Number(rawWeight) : null;
  const rawRemain = t?.remain != null ? Number(t.remain) : null;
  const remain = rawRemain != null && rawRemain >= 0 ? rawRemain : null;

  return {
    uid,
    variant_id: (t?.tray_id_name as string) ?? null,
    material: (t?.tray_type as string) ?? null,
    product: (t?.tray_sub_brands as string) ?? null,
    color_hex: (t?.tray_color as string) ?? null,
    color_hexes: colorHexes,
    weight,
    temp_min: t?.nozzle_temp_min != null ? Number(t.nozzle_temp_min) : null,
    temp_max: t?.nozzle_temp_max != null ? Number(t.nozzle_temp_max) : null,
    remain,
  };
}

const NETWORK_ERROR_CODES = new Set([
  "EACCES",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ECONNRESET",
]);

export function classifyMqttError(
  err: Error & { code?: number | string },
): PrinterErrorCode {
  if (err.code === 4 || err.code === 5) return "unauthorized";
  if (/not authorized|bad username|bad password/i.test(err.message)) {
    return "unauthorized";
  }
  if (typeof err.code === "string" && NETWORK_ERROR_CODES.has(err.code)) {
    return "unreachable";
  }
  if (/^connect E[A-Z]+ /.test(err.message)) return "unreachable";
  return "other";
}

export interface PrinterRuntime {
  printer: Printer;
  status: PrinterStatus;
  ams_units: AmsUnit[];
  disconnect(): Promise<void>;
}

export function decodeNozzleId(info: unknown): number | null {
  if (info == null) return null;
  const parsed = parseInt(String(info), 16);
  if (!Number.isFinite(parsed)) return null;
  const id = (parsed >> 8) & 0xf;
  if (id === 0xe) return null;
  return id;
}

function parseHexBits(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const n = parseInt(value, 16);
  return Number.isFinite(n) ? n : null;
}

export function parseAmsReport(
  printerSerial: string,
  payload: unknown,
): AmsUnit[] {
  const amsPayload = (payload as any)?.print?.ams;
  const trayExistBits = parseHexBits(amsPayload?.tray_exist_bits);
  const amsList = amsPayload?.ams;
  if (!Array.isArray(amsList)) return [];

  const units: AmsUnit[] = [];
  for (const ams of amsList) {
    const amsId = Number(ams?.id ?? 0);
    const nozzleId = decodeNozzleId(ams?.info);
    const trays: unknown[] = Array.isArray(ams?.tray) ? ams.tray : [];
    const slots = trays.map((tray) => {
      const t = tray as Record<string, unknown> | null;
      const slotId = Number(t?.id ?? 0);
      const globalBit = amsId * 4 + slotId;
      const hasSpool =
        trayExistBits != null
          ? ((trayExistBits >> globalBit) & 1) === 1
          : true;
      return {
        printer_serial: printerSerial,
        ams_id: amsId,
        slot_id: slotId,
        nozzle_id: nozzleId,
        has_spool: hasSpool,
        spool: hasSpool ? toSpoolData(tray) : null,
      };
    });
    slots.sort((a, b) => a.slot_id - b.slot_id);
    units.push({ id: amsId, nozzle_id: nozzleId, slots });
  }
  return units;
}

interface InternalClient {
  printer: Printer;
  status: PrinterStatus;
  ams_units: AmsUnit[];
  mqtt: MqttClient;
  disconnect(): Promise<void>;
}

function connect(printer: Printer, bus: AppEventBus): InternalClient {
  const status: PrinterStatus = {
    lastError: null,
    errorCode: null,
  };
  const amsUnits: AmsUnit[] = [];
  let hasEverReceivedMessage = false;
  let watchdog: NodeJS.Timeout | null = null;

  const emitStatus = () => bus.emit("printer:status", printer, { ...status });

  const armWatchdog = () => {
    if (hasEverReceivedMessage || watchdog) return;
    watchdog = setTimeout(() => {
      watchdog = null;
      if (hasEverReceivedMessage) return;
      status.errorCode = "no_response";
      status.lastError = null;
      emitStatus();
    }, 15_000);
  };

  const clearWatchdog = () => {
    if (watchdog) {
      clearTimeout(watchdog);
      watchdog = null;
    }
  };

  const url = `mqtts://${printer.host}:8883`;
  const client = mqtt.connect(url, {
    username: "bblp",
    password: printer.access_code,
    rejectUnauthorized: false,
    reconnectPeriod: 5000,
    connectTimeout: 10_000,
    clientId: `bsync-${printer.serial.slice(-6)}-${Math.random()
      .toString(16)
      .slice(2, 8)}`,
  });

  const topic = `device/${printer.serial}/report`;

  client.on("connect", () => {
    status.lastError = null;
    status.errorCode = null;
    emitStatus();
    client.subscribe(topic, (err) => {
      if (err) {
        status.lastError = `subscribe: ${err.message}`;
        status.errorCode = "other";
        emitStatus();
      }
    });
    client.publish(
      `device/${printer.serial}/request`,
      JSON.stringify({
        pushing: { sequence_id: "0", command: "pushall" },
      }),
    );
    armWatchdog();
  });

  client.on("error", (err) => {
    status.errorCode = classifyMqttError(err);
    status.lastError = err.message;
    emitStatus();
  });

  client.on("message", (_topic, msg) => {
    let payload: unknown;
    try {
      payload = JSON.parse(msg.toString());
    } catch {
      return;
    }
    if (!Array.isArray((payload as any)?.print?.ams?.ams)) return;
    const parsed = parseAmsReport(printer.serial, payload);
    amsUnits.length = 0;
    amsUnits.push(...parsed);
    hasEverReceivedMessage = true;
    clearWatchdog();
    status.errorCode = null;
    status.lastError = null;
    bus.emit("ams:update", printer, amsUnits);
  });

  return {
    printer,
    status,
    ams_units: amsUnits,
    mqtt: client,
    async disconnect() {
      clearWatchdog();
      const force = setTimeout(() => {
        try {
          client.end(true);
        } catch {}
      }, 2000);
      try {
        await client.endAsync();
      } catch {
      } finally {
        clearTimeout(force);
      }
    },
  };
}

export type PrinterConnectionPool = Map<string, InternalClient>;

export function createPrinterConnectionPool(): PrinterConnectionPool {
  return new Map();
}

export function syncPrinters(
  target: Printer[],
  state: PrinterConnectionPool,
  bus: AppEventBus,
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
      client.disconnect().catch(() => {});
      state.delete(serial);
    } else {
      client.printer = next;
    }
  }

  for (const printer of wanted.values()) {
    if (state.has(printer.serial)) continue;
    state.set(printer.serial, connect(printer, bus));
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
