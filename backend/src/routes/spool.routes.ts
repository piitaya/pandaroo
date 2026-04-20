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
import { ErrorCode, ErrorResponse, LocalSpoolResponse, conflict, errorBody, notFound } from "./schemas.js";

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
      operationId: "listSpools",
      tags: ["Spools"],
      description: "List tracked spools.",
      response: { 200: Type.Array(LocalSpoolResponse) },
    },
  }, async () => {
    return spoolService.list();
  });

  app.get<{ Params: { tagId: string } }>("/api/spools/:tagId", {
    schema: {
      operationId: "getSpool",
      tags: ["Spools"],
      description: "Fetch a spool by tag id.",
      params: Type.Object({ tagId: Type.String({ minLength: 1 }) }),
      response: { 200: LocalSpoolResponse, 404: ErrorResponse },
    },
  }, async (req, reply) => {
    const spool = spoolService.findByTagId(req.params.tagId);
    if (!spool) {
      return notFound(reply, "Spool not found.");
    }
    return spool;
  });

  const ScanResponse = Type.Object({
    spool: LocalSpoolResponse,
    created: Type.Boolean(),
  });

  app.post("/api/spools/scan", {
    schema: {
      operationId: "scanSpool",
      tags: ["Spools"],
      description: "Add or update a spool from a scanned NFC tag. 201 on create, 200 on update.",
      body: SpoolScanSchema,
      response: { 200: ScanResponse, 201: ScanResponse },
    },
  }, async (req, reply) => {
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
    const result = spoolService.upsert(scan, { source: "scan" })!;
    if (result.created) reply.code(201);
    return result;
  });

  app.patch<{ Params: { tagId: string } }>("/api/spools/:tagId", {
    schema: {
      operationId: "patchSpool",
      tags: ["Spools"],
      description: "Update spool fields. 409 when remain is AMS-managed.",
      params: Type.Object({ tagId: Type.String({ minLength: 1 }) }),
      body: SpoolPatchSchema,
      response: {
        200: LocalSpoolResponse,
        404: ErrorResponse,
        409: ErrorResponse,
      },
    },
  }, async (req, reply) => {
    const body = req.body as SpoolPatch;
    const result = spoolService.patch(req.params.tagId, body);
    if (result.ok) return result.spool;
    if (result.reason === "ams_managed") {
      return conflict(
        reply,
        "Unload the spool from the AMS first.",
        ErrorCode.AmsManagedRemain,
      );
    }
    return notFound(reply, "Spool not found.");
  });

  app.get<{ Params: { tagId: string }; Querystring: SpoolHistoryQuery }>(
    "/api/spools/:tagId/history",
    {
      schema: {
        operationId: "getSpoolHistory",
        tags: ["Spools"],
        description: "Event history for a spool. Newest first, cursor-paginated via `before`.",
        params: Type.Object({ tagId: Type.String({ minLength: 1 }) }),
        querystring: SpoolHistoryQuerySchema,
        response: { 200: SpoolHistoryResponseSchema, 404: ErrorResponse },
      },
    },
    async (req, reply) => {
      const spool = spoolService.findByTagId(req.params.tagId);
      if (!spool) {
        return notFound(reply, "Spool not found.");
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
        operationId: "updateSpoolHistoryEvent",
        tags: ["Spools"],
        description: "Edit a manual (adjust) history event.",
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
          return errorBody(
            "Only manual events can be edited.",
            ErrorCode.NotManual,
          );
        }
        return notFound(reply, "History event not found.");
      }
      return result.event;
    },
  );

  app.delete<{ Params: { tagId: string; eventId: string } }>(
    "/api/spools/:tagId/history/:eventId",
    {
      schema: {
        operationId: "deleteSpoolHistoryEvent",
        tags: ["Spools"],
        description: "Delete a manual (adjust) history event.",
        params: Type.Object({
          tagId: Type.String({ minLength: 1 }),
          eventId: Type.String({ pattern: "^[0-9]+$" }),
        }),
        response: { 204: Type.Null(), 400: ErrorResponse, 404: ErrorResponse },
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
          return errorBody(
            "Only manual events can be removed.",
            ErrorCode.NotManual,
          );
        }
        return notFound(reply, "History event not found.");
      }
      reply.code(204);
      return;
    },
  );

  app.delete<{ Params: { tagId: string } }>("/api/spools/:tagId", {
    schema: {
      operationId: "deleteSpool",
      tags: ["Spools"],
      description: "Delete a spool. 409 when loaded in an AMS. Cascades to Spoolman when synced.",
      params: Type.Object({ tagId: Type.String({ minLength: 1 }) }),
      response: { 204: Type.Null(), 404: ErrorResponse, 409: ErrorResponse },
    },
  }, async (req, reply) => {
    const { tagId } = req.params;
    const spool = spoolService.findByTagId(tagId);

    const result = spoolService.delete(tagId);
    if (!result.ok) {
      if (result.reason === "ams_loaded") {
        return conflict(
          reply,
          "Unload the spool from the AMS first.",
          ErrorCode.AmsLoaded,
        );
      }
      return notFound(reply, "Spool not found.");
    }

    const { spoolman } = configStore.current;
    const spoolmanSpoolId =
      spool && (spool.sync.status === "synced" || spool.sync.status === "stale")
        ? spool.sync.spoolman_spool_id
        : null;
    if (spoolman.url && spoolmanSpoolId != null) {
      try {
        const client = createSpoolmanClient(spoolman.url);
        await client.deleteSpool(spoolmanSpoolId);
      } catch (err) {
        app.log.warn(
          { tagId, spoolmanSpoolId, err },
          "Spoolman cascade-delete failed — local spool already deleted",
        );
      }
    }

    reply.code(204);
    return;
  });
};
