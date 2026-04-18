import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";
import type { SpoolReading } from "@bambu-spoolman-sync/shared";
import {
  SpoolScanSchema,
  SpoolPatchSchema,
  SpoolHistoryEventPatchSchema,
  SpoolHistoryEventSchema,
  SpoolHistoryQuerySchema,
  SpoolHistoryResponseSchema,
  type SpoolScan,
  type SpoolPatch,
  type SpoolHistoryEventPatch,
  type SpoolHistoryQuery,
} from "./schemas.js";
import type { ConfigStore } from "../config-store.js";
import type { SpoolService } from "../services/spool.service.js";
import type { SpoolHistoryService } from "../services/spool-history.service.js";
import { createSpoolmanClient } from "../clients/spoolman.client.js";
import { ErrorResponse, LocalSpoolResponse, OkResponse } from "./schemas.js";

export interface SpoolRouteDeps {
  configStore: ConfigStore;
  spoolService: SpoolService;
  spoolHistoryService: SpoolHistoryService;
}

const DEFAULT_HISTORY_LIMIT = 1000;
const DEFAULT_HISTORY_WINDOW_DAYS = 30;

export const spoolRoutes: FastifyPluginAsync<SpoolRouteDeps> = async (app, { configStore, spoolService, spoolHistoryService }) => {
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

  app.post("/api/spools/scan", {
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
    spoolService.upsert(scan, { source: "scan" });
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

  app.get<{ Params: { tagId: string }; Querystring: SpoolHistoryQuery }>(
    "/api/spools/:tagId/history",
    {
      schema: {
        tags: ["Spools"],
        description:
          "Fetch the append-only event history for a spool. Returns events newest-first within an optional date range, paginated via `before` cursor.",
        params: Type.Object({ tagId: Type.String({ minLength: 1 }) }),
        querystring: SpoolHistoryQuerySchema,
        response: { 200: SpoolHistoryResponseSchema, 404: ErrorResponse },
      },
    },
    async (req, reply) => {
      const spool = spoolService.findByTagId(req.params.tagId);
      if (!spool) {
        reply.code(404);
        return { error: "No spool found with this tag id." };
      }

      const now = new Date();
      const fromDate =
        req.query.from ??
        new Date(now.getTime() - DEFAULT_HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const toDate = req.query.to ?? now.toISOString();
      const limit = req.query.limit ?? DEFAULT_HISTORY_LIMIT;

      const events = spoolHistoryService.list(req.params.tagId, {
        from: fromDate,
        to: toDate,
        before: req.query.before,
        limit: limit + 1,
      });

      const hasMore = events.length > limit;
      const trimmed = hasMore ? events.slice(0, limit) : events;

      return {
        events: trimmed,
        has_more: hasMore,
        range: { from: fromDate, to: toDate },
      };
    },
  );

  app.patch<{
    Params: { tagId: string; eventId: string };
    Body: SpoolHistoryEventPatch;
  }>(
    "/api/spools/:tagId/history/:eventId",
    {
      schema: {
        tags: ["Spools"],
        description:
          "Edit a manual history event (only `source=manual` events are editable). Updates the recorded `remain` value in place; does not change the spool's current remain.",
        params: Type.Object({
          tagId: Type.String({ minLength: 1 }),
          eventId: Type.String({ pattern: "^[0-9]+$" }),
        }),
        body: SpoolHistoryEventPatchSchema,
        response: {
          200: SpoolHistoryEventSchema,
          400: ErrorResponse,
          404: ErrorResponse,
        },
      },
    },
    async (req, reply) => {
      const eventId = Number(req.params.eventId);
      const result = spoolHistoryService.updateManual(
        req.params.tagId,
        eventId,
        req.body,
      );
      if (!result.ok) {
        if (result.reason === "not_manual") {
          reply.code(400);
          return { error: "Only manual history events can be edited." };
        }
        reply.code(404);
        return { error: "No history event found for this tag and id." };
      }
      return result.event;
    },
  );

  app.delete<{ Params: { tagId: string; eventId: string } }>(
    "/api/spools/:tagId/history/:eventId",
    {
      schema: {
        tags: ["Spools"],
        description:
          "Delete a manual history event (only `source=manual` events can be removed).",
        params: Type.Object({
          tagId: Type.String({ minLength: 1 }),
          eventId: Type.String({ pattern: "^[0-9]+$" }),
        }),
        response: { 200: OkResponse, 400: ErrorResponse, 404: ErrorResponse },
      },
    },
    async (req, reply) => {
      const eventId = Number(req.params.eventId);
      const result = spoolHistoryService.deleteManual(
        req.params.tagId,
        eventId,
      );
      if (!result.ok) {
        if (result.reason === "not_manual") {
          reply.code(400);
          return { error: "Only manual history events can be removed." };
        }
        reply.code(404);
        return { error: "No history event found for this tag and id." };
      }
      return { ok: true };
    },
  );

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
