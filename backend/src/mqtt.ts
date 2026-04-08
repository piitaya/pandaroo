import mqtt, { type MqttClient } from "mqtt";
import type { Printer } from "./config.js";
import type { AMSSlot } from "./matcher.js";

/**
 * Friendly error categories for the dashboard. The frontend looks
 * up an i18n title/description per code; "other" falls back to the
 * raw `lastError` string.
 */
export type PrinterErrorCode =
  | "unauthorized" // CONNACK 4/5 — bad access code
  | "no_response" // connected, never received a message — bad serial
  | "unreachable" // EACCES/ECONNREFUSED/ETIMEDOUT/ENOTFOUND/…
  | "other";

export interface PrinterStatus {
  lastError: string | null;
  errorCode: PrinterErrorCode | null;
}

const NETWORK_ERROR_CODES = new Set([
  "EACCES",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ECONNRESET"
]);

/**
 * Classify a raw mqtt.js error into a friendly error code. Pure;
 * tested directly in mqtt.test.ts without spinning up a real client.
 */
export function classifyMqttError(
  err: Error & { code?: number | string }
): PrinterErrorCode {
  // mqtt.js exposes the MQTT 3.1.1 CONNACK return code on `code`.
  // 4 = bad username/password, 5 = not authorized.
  if (err.code === 4 || err.code === 5) return "unauthorized";

  // Belt-and-braces: some mqtt.js versions drop the numeric code but
  // keep the human suffix.
  if (/not authorized|bad username|bad password/i.test(err.message)) {
    return "unauthorized";
  }

  // Node syscall errors — string codes.
  if (typeof err.code === "string" && NETWORK_ERROR_CODES.has(err.code)) {
    return "unreachable";
  }

  // The Node `connect` error message embeds the syscall name when
  // `.code` is missing — sniff for it.
  if (/^connect E[A-Z]+ /.test(err.message)) return "unreachable";

  return "other";
}

export interface PrinterRuntime {
  printer: Printer;
  status: PrinterStatus;
  slots: AMSSlot[];
  disconnect(): Promise<void>;
}

export type OnStatus = (printer: Printer, status: PrinterStatus) => void;
export type OnSlots = (printer: Printer, slots: AMSSlot[]) => void;

/**
 * Decode the nozzle (extruder) assignment from an AMS `info` hex string.
 * Bits 8–11 encode the extruder id, per BambuStudio's `DevFilaSystem.cpp`:
 *   0 → right / main nozzle
 *   1 → left / deputy nozzle
 *   0xE → uninitialized (return null)
 * Returns null for missing/unparseable values.
 */
export function decodeNozzleId(info: unknown): number | null {
  if (info == null) return null;
  const parsed = parseInt(String(info), 16);
  if (!Number.isFinite(parsed)) return null;
  const id = (parsed >> 8) & 0xf;
  if (id === 0xe) return null;
  return id;
}

/**
 * Flatten `payload.print.ams.ams[].tray[]` into a flat AMSSlot[].
 * Reference: https://github.com/Doridian/OpenBambuAPI/blob/main/mqtt.md
 */
export function parseAmsReport(
  printerSerial: string,
  payload: unknown
): AMSSlot[] {
  const amsList = (payload as any)?.print?.ams?.ams;
  if (!Array.isArray(amsList)) return [];
  const slots: AMSSlot[] = [];
  for (const ams of amsList) {
    const amsId = Number(ams?.id ?? 0);
    const nozzleId = decodeNozzleId(ams?.info);
    const trays = Array.isArray(ams?.tray) ? ams.tray : [];
    for (const tray of trays) {
      slots.push({
        printer_serial: printerSerial,
        ams_id: amsId,
        nozzle_id: nozzleId,
        slot_id: Number(tray?.id ?? 0),
        tray_id_name: tray?.tray_id_name ?? null,
        tray_sub_brands: tray?.tray_sub_brands ?? null,
        tray_type: tray?.tray_type ?? null,
        tray_color: tray?.tray_color ?? null,
        tray_colors: Array.isArray(tray?.cols)
          ? (tray.cols as unknown[]).filter(
              (c): c is string => typeof c === "string"
            )
          : null,
        tray_uuid: tray?.tray_uuid ?? null,
        nozzle_temp_min:
          tray?.nozzle_temp_min != null ? Number(tray.nozzle_temp_min) : null,
        nozzle_temp_max:
          tray?.nozzle_temp_max != null ? Number(tray.nozzle_temp_max) : null,
        tray_weight: tray?.tray_weight ?? null,
        remain: tray?.remain != null ? Number(tray.remain) : null
      });
    }
  }
  return slots;
}

interface InternalClient {
  printer: Printer;
  status: PrinterStatus;
  slots: AMSSlot[];
  mqtt: MqttClient;
  disconnect(): Promise<void>;
}

function connect(
  printer: Printer,
  onStatus?: OnStatus,
  onSlots?: OnSlots
): InternalClient {
  const status: PrinterStatus = {
    lastError: null,
    errorCode: null
  };
  const state = { slots: [] as AMSSlot[] };
  let hasEverReceivedMessage = false;
  let watchdog: NodeJS.Timeout | null = null;

  const emitStatus = () => onStatus?.(printer, { ...status });

  // Wrong-serial detection: after a successful CONNECT we publish
  // `pushall` and expect the printer to start streaming state within
  // a couple of seconds. If nothing arrives in 15s, the most likely
  // cause is a wrong serial in the topic prefix — surface it as a
  // friendly "no_response" error rather than spinning forever.
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
    // Bambu printers serve a self-signed cert on the local broker —
    // there's no realistic way to get a CA-signed cert for a LAN-only
    // device, so we skip cert validation.
    rejectUnauthorized: false,
    reconnectPeriod: 5000,
    connectTimeout: 10_000,
    clientId: `bsync-${printer.serial.slice(-6)}-${Math.random()
      .toString(16)
      .slice(2, 8)}`
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
      JSON.stringify({ pushing: { sequence_id: "0", command: "pushall" } })
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
    state.slots = parseAmsReport(printer.serial, payload);
    hasEverReceivedMessage = true;
    clearWatchdog();
    status.errorCode = null;
    status.lastError = null;
    onSlots?.(printer, state.slots);
  });

  return {
    printer,
    status,
    get slots() {
      return state.slots;
    },
    mqtt: client,
    async disconnect() {
      clearWatchdog();
      // Give the graceful end 2s; after that, force-close. endAsync
      // resolves either when the DISCONNECT packet is flushed or when
      // force-end takes over, so we never leak a dangling client.
      const force = setTimeout(() => {
        try {
          client.end(true);
        } catch {}
      }, 2000);
      try {
        await client.endAsync();
      } catch {
        // Already torn down by the force timer — nothing to do.
      } finally {
        clearTimeout(force);
      }
    }
  };
}

export type MqttState = Map<string, InternalClient>;

export function createMqttState(): MqttState {
  return new Map();
}

/**
 * Reconcile the live MQTT clients against the target printer list.
 * Keyed by serial — which IS the printer identity. Clients whose
 * host or access_code changed are torn down and recreated; rename
 * or enabled toggles are applied without dropping the session.
 */
export function syncPrinters(
  target: Printer[],
  state: MqttState,
  onStatus?: OnStatus,
  onSlots?: OnSlots
): void {
  const wanted = new Map(
    target.filter((p) => p.enabled).map((p) => [p.serial, p])
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
      // Same connection params but potentially a different name —
      // replace the stored reference so callbacks see the fresh one.
      client.printer = next;
    }
  }

  for (const printer of wanted.values()) {
    if (state.has(printer.serial)) continue;
    state.set(printer.serial, connect(printer, onStatus, onSlots));
  }
}

export function listRuntimes(state: MqttState): PrinterRuntime[] {
  return Array.from(state.values()).map((c) => ({
    printer: c.printer,
    status: c.status,
    slots: c.slots,
    disconnect: c.disconnect
  }));
}

export async function disconnectAll(state: MqttState): Promise<void> {
  await Promise.all(Array.from(state.values()).map((c) => c.disconnect()));
  state.clear();
}
