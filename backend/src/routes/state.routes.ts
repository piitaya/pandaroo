import type { FastifyPluginAsync } from "fastify";
import { matchSlot, type Mapping } from "../filament-catalog.js";
import type { ConfigStore } from "../config-store.js";
import type { SpoolService } from "../services/spool.service.js";
import { listRuntimes, type PrinterConnectionPool } from "../clients/bambu/index.js";

export interface StateRouteDeps {
  configStore: ConfigStore;
  mapping: Mapping;
  printerPool: PrinterConnectionPool;
  spoolService: SpoolService;
}

export const stateRoutes: FastifyPluginAsync<StateRouteDeps> = async (app, { configStore, mapping, printerPool, spoolService }) => {
  app.get("/api/state", {
    schema: {
      tags: ["State"],
      description: "Get live printer status, AMS contents, and sync state",
    },
  }, async () => {
    const config = configStore.current;
    const runtimes = listRuntimes(printerPool);
    const bySerial = new Map(runtimes.map((r) => [r.printer.serial, r]));
    const syncStates = spoolService.listSyncStates();

    const printers = config.printers.map((p) => {
      const runtime = bySerial.get(p.serial);
      const ams_units = (runtime?.ams_units ?? []).map((unit) => ({
        id: unit.id,
        nozzle_id: unit.nozzle_id,
        slots: unit.slots.map((slot) => {
          const tagId = slot.spool?.tag_id ?? null;
          return {
            slot,
            ...matchSlot(slot, mapping.byId),
            sync: (tagId && syncStates.get(tagId)) ?? { status: "never" as const },
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

    return {
      printers,
      filament_catalog: {
        count: mapping.byId.size,
        fetched_at: mapping.fetchedAt,
      },
    };
  });
};
