import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";
import { createSpoolmanClient } from "../clients/spoolman.client.js";
import type { RouteDeps } from "../context.js";
import { syncByTagIds } from "../sync.js";
import { ErrorResponse } from "./schemas.js";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const SpoolSyncResultResponse = Type.Object({
  tag_id: Type.String(),
  spoolman_spool_id: Type.Number(),
  created_filament: Type.Boolean(),
  created_spool: Type.Boolean(),
});

const SyncResultResponse = Type.Object({
  synced: Type.Array(SpoolSyncResultResponse),
  skipped: Type.Array(
    Type.Object({ tag_id: Type.String(), reason: Type.String() }),
  ),
  errors: Type.Array(
    Type.Object({ tag_id: Type.String(), error: Type.String() }),
  ),
});

export const spoolmanRoutes: FastifyPluginAsync<RouteDeps> = async (app, { ctx }) => {
  app.post("/api/spoolman/test", {
    schema: {
      tags: ["Spoolman"],
      description: "Test Spoolman connectivity",
      response: {
        200: Type.Object({
          ok: Type.Boolean(),
          info: Type.Object({ version: Type.Optional(Type.String()) }),
          base_url: Type.Union([Type.String(), Type.Null()]),
        }),
        400: ErrorResponse,
        502: ErrorResponse,
      },
    },
  }, async (_req, reply) => {
    const url = ctx.config.spoolman.url;
    if (!url) {
      reply.code(400);
      return { error: "Spoolman URL is not configured." };
    }
    const signal = AbortSignal.timeout(3000);
    try {
      const client = createSpoolmanClient(url);
      const [info, base_url] = await Promise.all([
        client.getInfo(signal),
        client.getBaseUrl(signal),
      ]);
      return { ok: true, info, base_url };
    } catch (err) {
      reply.code(502);
      return { error: errorMessage(err) };
    }
  });

  app.post("/api/spoolman/sync", {
    schema: {
      tags: ["Spoolman"],
      description: "Sync spools to Spoolman by tag IDs",
      body: Type.Object({
        tag_ids: Type.Array(Type.String(), { minItems: 1 }),
      }),
      response: { 200: SyncResultResponse, 400: ErrorResponse },
    },
  }, async (req, reply) => {
    const { tag_ids } = req.body as { tag_ids: string[] };
    const url = ctx.config.spoolman.url;
    if (!url) {
      reply.code(400);
      return { error: "Spoolman URL is not configured." };
    }
    try {
      return await syncByTagIds(ctx.createSyncDeps(), tag_ids);
    } catch (err) {
      reply.code(400);
      return { error: errorMessage(err) };
    }
  });

  app.post("/api/spoolman/sync-all", {
    schema: {
      tags: ["Spoolman"],
      description: "Sync every spool in the local DB to Spoolman",
      response: { 200: SyncResultResponse, 400: ErrorResponse },
    },
  }, async (_req, reply) => {
    const url = ctx.config.spoolman.url;
    if (!url) {
      reply.code(400);
      return { error: "Spoolman URL is not configured." };
    }
    const tagIds = ctx.spoolService.listTagIds();
    if (tagIds.length === 0) {
      return { synced: [], skipped: [], errors: [] };
    }
    try {
      return await syncByTagIds(ctx.createSyncDeps(), tagIds);
    } catch (err) {
      reply.code(400);
      return { error: errorMessage(err) };
    }
  });
};
