import type { FastifyPluginAsync } from "fastify";
import type { AmsSlot } from "@bambu-spoolman-sync/shared";
import { matchSlot, type Mapping } from "../filament-catalog.js";
import type { ConfigStore } from "../config-store.js";
import { listRuntimes, type PrinterConnectionPool } from "../clients/bambu/index.js";

export interface PrinterStatusRouteDeps {
  configStore: ConfigStore;
  mapping: Mapping;
  printerPool: PrinterConnectionPool;
}

export const printerStatusRoutes: FastifyPluginAsync<PrinterStatusRouteDeps> = async (
  app,
  { configStore, mapping, printerPool },
) => {
  app.get("/api/printers/status", {
    schema: {
      tags: ["Printers"],
      description: "Get live printer status and AMS contents",
    },
  }, async () => {
    const config = configStore.current;
    const runtimes = listRuntimes(printerPool);
    const bySerial = new Map(runtimes.map((r) => [r.printer.serial, r]));

    return config.printers.map((p) => {
      const runtime = bySerial.get(p.serial);
      const ams_units = (runtime?.ams_units ?? []).map((unit) => ({
        id: unit.id,
        nozzle_id: unit.nozzle_id,
        slots: unit.slots.map((slot): AmsSlot => {
          const match = matchSlot(slot, mapping.byId);
          return {
            ams_id: slot.ams_id,
            slot_id: slot.slot_id,
            nozzle_id: slot.nozzle_id,
            has_spool: slot.has_spool,
            reading: slot.spool,
            match_type: match.type,
            color_name: match.entry?.color_name ?? null,
          };
        }),
      }));

      return {
        serial: p.serial,
        name: p.name,
        enabled: p.enabled,
        status: runtime?.status ?? { lastError: null, errorCode: null },
        ams_units,
      };
    });
  });
};
