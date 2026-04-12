import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";
import type { SpoolData } from "@bambu-spoolman-sync/shared";
import { SpoolScanSchema, type SpoolScan } from "./schemas.js";
import type { RouteDeps } from "../context.js";
import { createSpoolmanClient } from "../clients/spoolman.client.js";
import { ErrorResponse, LocalSpoolResponse, OkResponse } from "./schemas.js";

export const spoolRoutes: FastifyPluginAsync<RouteDeps> = async (app, { ctx }) => {
  app.get("/api/spools", {
    schema: {
      tags: ["Spools"],
      description: "List all locally tracked spools, enriched with filament name from community DB",
      response: { 200: Type.Array(LocalSpoolResponse) },
    },
  }, async () => {
    return ctx.spoolService.list();
  });

  app.get<{ Params: { tagId: string } }>("/api/spools/:tagId", {
    schema: {
      tags: ["Spools"],
      description: "Fetch a single locally tracked spool by tag id",
      params: Type.Object({ tagId: Type.String({ minLength: 1 }) }),
      response: { 200: LocalSpoolResponse, 404: ErrorResponse },
    },
  }, async (req, reply) => {
    const spool = ctx.spoolService.findByTagId(req.params.tagId);
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
    const scan: SpoolData = {
      ...body,
      color_hexes: body.color_hexes ?? null,
      remain: body.remain ?? null,
    };
    ctx.spoolService.upsert(scan);
    return ctx.spoolService.findByTagId(body.uid)!;
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
    const spool = ctx.spoolService.findByTagId(tagId);

    const deleted = ctx.spoolService.delete(tagId);
    if (!deleted) {
      reply.code(404);
      return { error: "No spool found with this tag id." };
    }

    if (
      ctx.config.spoolman.auto_sync &&
      ctx.config.spoolman.url &&
      spool &&
      (spool.sync.status === "synced" || spool.sync.status === "stale")
    ) {
      try {
        const client = createSpoolmanClient(ctx.config.spoolman.url);
        await client.deleteSpool(spool.sync.spoolman_spool_id);
      } catch {
        // Best-effort: local spool is already deleted
      }
    }

    return { ok: true };
  });
};
