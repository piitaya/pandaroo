import type { FastifyPluginAsync } from "fastify";
import { matchSlot } from "../domain/matcher.js";
import { deriveSlotSyncView } from "../domain/sync-view.js";
import type { RouteDeps } from "../context.js";
import { listRuntimes } from "../clients/bambu.client.js";

export const stateRoutes: FastifyPluginAsync<RouteDeps> = async (app, { ctx }) => {
  app.get("/api/state", {
    schema: {
      tags: ["State"],
      description: "Get live printer status, AMS contents, and sync state",
    },
  }, async () => {
    const { config, mapping, mqttState, spoolRepo, syncStateRepo } = ctx;
    const runtimes = listRuntimes(mqttState);
    const bySerial = new Map(runtimes.map((r) => [r.printer.serial, r]));

    const spoolRows = new Map(spoolRepo.list().map((row) => [row.tagId, row]));
    const syncRows = new Map(
      syncStateRepo.listAll().map((row) => [row.tagId, row]),
    );

    const printers = config.printers.map((p) => {
      const runtime = bySerial.get(p.serial);
      const ams_units = (runtime?.ams_units ?? []).map((unit) => ({
        id: unit.id,
        nozzle_id: unit.nozzle_id,
        slots: unit.slots.map((slot) => {
          const uid = slot.spool?.uid ?? null;
          const spoolRow = uid ? spoolRows.get(uid) : undefined;
          const syncRow = uid ? syncRows.get(uid) : undefined;
          return {
            slot,
            ...matchSlot(slot, mapping.byId),
            sync: deriveSlotSyncView(slot, spoolRow, syncRow),
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
