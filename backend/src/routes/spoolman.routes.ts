import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { createSpoolmanClient } from "../clients/spoolman.client.js";
import type { ConfigStore } from "../config-store.js";
import type { SpoolService } from "../services/spool.service.js";
import type { SyncDeps } from "../spoolman-sync.js";
import { syncByTagIds } from "../spoolman-sync.js";
import { ErrorCode, ErrorResponse, errorBody, errorMessage } from "./schemas.js";

function requireSpoolmanUrl(configStore: ConfigStore, reply: FastifyReply): string | undefined {
  const url = configStore.current.spoolman.url;
  if (url) return url;
  reply.code(400).send(errorBody("Spoolman URL not configured.", ErrorCode.SpoolmanNotConfigured));
  return undefined;
}

export interface SpoolmanRouteDeps {
  configStore: ConfigStore;
  spoolService: SpoolService;
  createSyncDeps(): SyncDeps;
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

export const spoolmanRoutes: FastifyPluginAsync<SpoolmanRouteDeps> = async (app, { configStore, spoolService, createSyncDeps }) => {
  app.get("/api/spoolman/status", {
    schema: {
      operationId: "getSpoolmanStatus",
      tags: ["Spoolman"],
      description: "Check Spoolman connectivity.",
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
    const url = requireSpoolmanUrl(configStore, reply);
    if (!url) return;
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
      return errorBody(errorMessage(err), ErrorCode.SpoolmanUnreachable);
    }
  });

  app.post("/api/spoolman/sync", {
    schema: {
      operationId: "syncSpoolmanByTagIds",
      tags: ["Spoolman"],
      description: "Sync selected spools to Spoolman.",
      body: Type.Object({
        tag_ids: Type.Array(Type.String(), { minItems: 1 }),
      }),
      response: { 200: SyncResultResponse, 400: ErrorResponse, 502: ErrorResponse },
    },
  }, async (req, reply) => {
    const { tag_ids } = req.body as { tag_ids: string[] };
    if (!requireSpoolmanUrl(configStore, reply)) return;
    try {
      return await syncByTagIds(createSyncDeps(), tag_ids);
    } catch (err) {
      reply.code(502);
      return errorBody(errorMessage(err), ErrorCode.SpoolmanRequestFailed);
    }
  });

  app.post("/api/spoolman/sync-all", {
    schema: {
      operationId: "syncSpoolmanAll",
      tags: ["Spoolman"],
      description: "Sync all tracked spools to Spoolman.",
      response: { 200: SyncResultResponse, 400: ErrorResponse, 502: ErrorResponse },
    },
  }, async (_req, reply) => {
    if (!requireSpoolmanUrl(configStore, reply)) return;
    const tagIds = spoolService.listTagIds();
    if (tagIds.length === 0) {
      return { synced: [], skipped: [], errors: [] };
    }
    try {
      return await syncByTagIds(createSyncDeps(), tagIds);
    } catch (err) {
      reply.code(502);
      return errorBody(errorMessage(err), ErrorCode.SpoolmanRequestFailed);
    }
  });
};
