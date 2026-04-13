import mqtt, { type MqttClient } from "mqtt";
import type { FastifyBaseLogger } from "fastify";
import type { Printer, PrinterStatus } from "@bambu-spoolman-sync/shared";
import type { AppEventBus } from "../../events.js";
import { classifyMqttError } from "./errors.js";
import { parseAmsReport, type AmsUnit } from "./parse.js";

export interface PrinterRuntime {
  printer: Printer;
  status: PrinterStatus;
  ams_units: AmsUnit[];
  disconnect(): Promise<void>;
}

export interface InternalClient {
  printer: Printer;
  status: PrinterStatus;
  ams_units: AmsUnit[];
  mqtt: MqttClient;
  disconnect(): Promise<void>;
}

export function connect(printer: Printer, bus: AppEventBus, log: FastifyBaseLogger): InternalClient {
  const ctx = { serial: printer.serial, name: printer.name };
  const status: PrinterStatus = {
    lastError: null,
    errorCode: null,
  };
  const amsUnits: AmsUnit[] = [];
  let hasEverReceivedMessage = false;
  let watchdog: NodeJS.Timeout | null = null;

  const emitStatus = () => bus.emit("printer:status-changed", printer, { ...status });

  const armWatchdog = () => {
    if (hasEverReceivedMessage || watchdog) return;
    watchdog = setTimeout(() => {
      watchdog = null;
      if (hasEverReceivedMessage) return;
      status.errorCode = "no_response";
      status.lastError = null;
      log.warn({ ...ctx, host: printer.host }, "Printer not responding (check IP and network)");
      emitStatus();
    }, 15_000);
  };

  const clearWatchdog = () => {
    if (watchdog) {
      clearTimeout(watchdog);
      watchdog = null;
    }
  };

  log.info({ ...ctx, host: printer.host }, "Connecting to printer");

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
    log.info(ctx, "Printer connected");
    status.lastError = null;
    status.errorCode = null;
    emitStatus();
    client.subscribe(topic, (err) => {
      if (err) {
        log.warn({ ...ctx, err }, "MQTT subscribe failed");
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
    const errorCode = classifyMqttError(err);
    log.warn({ ...ctx, errorCode, err: err.message }, "Printer connection error");
    status.errorCode = errorCode;
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

    log.debug({ serial: printer.serial, amsUnitCount: parsed.length }, "AMS report received");

    hasEverReceivedMessage = true;
    clearWatchdog();
    status.errorCode = null;
    status.lastError = null;
    bus.emit("ams:reported", printer, amsUnits);
  });

  return {
    printer,
    status,
    ams_units: amsUnits,
    mqtt: client,
    async disconnect() {
      log.info(ctx, "Disconnecting from printer");
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
