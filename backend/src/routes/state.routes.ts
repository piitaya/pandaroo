import type { FastifyPluginAsync } from "fastify";
import { matchSlot } from "../mapping.js";
import type { RouteDeps } from "../context.js";
import { listRuntimes } from "../clients/bambu.client.js";

export const stateRoutes: FastifyPluginAsync<RouteDeps> = async (app, { ctx }) => {
  app.get("/api/state", {
    schema: {
      tags: ["State"],
      description: "Get live printer status, AMS contents, and sync state",
    },
  }, async () => {
    const { config, mapping, printerConnections, spoolService } = ctx;
    const runtimes = listRuntimes(printerConnections);
    const bySerial = new Map(runtimes.map((r) => [r.printer.serial, r]));
    const syncStates = spoolService.listSyncStates();

    const printers = config.printers.map((p) => {
      const runtime = bySerial.get(p.serial);
      const ams_units = (runtime?.ams_units ?? []).map((unit) => ({
        id: unit.id,
        nozzle_id: unit.nozzle_id,
        slots: unit.slots.map((slot) => {
          const uid = slot.spool?.uid ?? null;
          return {
            slot,
            ...matchSlot(slot, mapping.byId),
            sync: (uid && syncStates.get(uid)) ?? { status: "never" as const },
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
      mapping: {
        count: mapping.byId.size,
        fetched_at: mapping.fetchedAt,
      },
    };
  });
};
