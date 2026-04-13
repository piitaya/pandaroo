import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";
import type { SpoolReading } from "@bambu-spoolman-sync/shared";
import { SpoolScanSchema, SpoolPatchSchema, type SpoolScan, type SpoolPatch } from "./schemas.js";
import type { ConfigStore } from "../config-store.js";
import type { SpoolService } from "../services/spool.service.js";
import { createSpoolmanClient } from "../clients/spoolman.client.js";
import { ErrorResponse, LocalSpoolResponse, OkResponse } from "./schemas.js";

export interface SpoolRouteDeps {
  configStore: ConfigStore;
  spoolService: SpoolService;
}

export const spoolRoutes: FastifyPluginAsync<SpoolRouteDeps> = async (app, { configStore, spoolService }) => {
  app.get("/api/spools", {
    schema: {
      tags: ["Spools"],
      description: "List all locally tracked spools, enriched with filament name from community DB",
      response: { 200: Type.Array(LocalSpoolResponse) },
    },
  }, async () => {
    return spoolService.list();
  });

  app.get<{ Params: { tagId: string } }>("/api/spools/:tagId", {
    schema: {
      tags: ["Spools"],
      description: "Fetch a single locally tracked spool by tag id",
      params: Type.Object({ tagId: Type.String({ minLength: 1 }) }),
      response: { 200: LocalSpoolResponse, 404: ErrorResponse },
    },
  }, async (req, reply) => {
    const spool = spoolService.findByTagId(req.params.tagId);
    if (!spool) {
      reply.code(404);
      return { error: "No spool found with this tag id." };
    }
    return spool;
  });

  app.put("/api/spools", {
    schema: {
      tags: ["Spools"],
      description: "Add or update a spool from a scanned NFC tag, persist locally, and return the enriched local spool",
      body: SpoolScanSchema,
      response: { 200: LocalSpoolResponse },
    },
  }, async (req) => {
    const body = req.body as SpoolScan;
    const scan: SpoolReading = {
      tag_id: body.uid,
      variant_id: body.variant_id,
      material: body.material,
      product: body.product,
      color_hex: body.color_hex,
      color_hexes: body.color_hexes ?? null,
      weight: body.weight,
      temp_min: body.temp_min,
      temp_max: body.temp_max,
      remain: body.remain ?? null,
    };
    spoolService.upsert(scan);
    return spoolService.findByTagId(body.uid)!;
  });

  app.patch<{ Params: { tagId: string } }>("/api/spools/:tagId", {
    schema: {
      tags: ["Spools"],
      description: "Update spool fields (e.g. adjust remaining %)",
      params: Type.Object({ tagId: Type.String({ minLength: 1 }) }),
      body: SpoolPatchSchema,
      response: { 200: LocalSpoolResponse, 404: ErrorResponse },
    },
  }, async (req, reply) => {
    const body = req.body as SpoolPatch;
    const spool = spoolService.patch(req.params.tagId, body);
    if (!spool) {
      reply.code(404);
      return { error: "No spool found with this tag id." };
    }
    return spool;
  });

  app.delete<{ Params: { tagId: string } }>("/api/spools/:tagId", {
    schema: {
      tags: ["Spools"],
      description: "Delete a locally tracked spool by tag id, also from Spoolman if synced",
      params: Type.Object({ tagId: Type.String({ minLength: 1 }) }),
      response: { 200: OkResponse, 404: ErrorResponse },
    },
  }, async (req, reply) => {
    const { tagId } = req.params;
    const spool = spoolService.findByTagId(tagId);

    const deleted = spoolService.delete(tagId);
    if (!deleted) {
      reply.code(404);
      return { error: "No spool found with this tag id." };
    }

    const { spoolman } = configStore.current;
    if (
      spoolman.auto_sync &&
      spoolman.url &&
      spool &&
      (spool.sync.status === "synced" || spool.sync.status === "stale")
    ) {
      try {
        const client = createSpoolmanClient(spoolman.url);
        await client.deleteSpool(spool.sync.spoolman_spool_id);
      } catch {
        // Best-effort: local spool is already deleted
      }
    }

    return { ok: true };
  });
};
