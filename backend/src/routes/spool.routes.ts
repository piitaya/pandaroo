import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";
import { SpoolScanSchema, type SpoolScan, type Spool } from "../domain/spool.js";
import { matchSpool, type FilamentEntry } from "../domain/matcher.js";
import type { RouteDeps } from "../context.js";
import type { SpoolRow } from "../db/spool.repository.js";
import type { SpoolSyncStateRow } from "../db/sync-state.repository.js";
import { createSpoolmanClient } from "../clients/spoolman.client.js";
import { ErrorResponse, LocalSpoolResponse, OkResponse } from "./schemas.js";

function toLocalSpoolResponse(
  row: SpoolRow,
  syncRow: SpoolSyncStateRow | undefined,
  mapping: Map<string, FilamentEntry>,
) {
  const match = matchSpool(
    {
      variant_id: row.variantId,
      material: row.material,
      product: row.product,
    },
    mapping,
  );
  return {
    tag_id: row.tagId,
    variant_id: row.variantId,
    match_type: match.type,
    material: row.material,
    product: row.product,
    color_hex: row.colorHex,
    color_name: match.entry?.color_name ?? null,
    weight: row.weight,
    remain: row.remain,
    last_used: row.lastUsed,
    first_seen: row.firstSeen,
    last_updated: row.lastUpdated,
    last_synced: syncRow?.lastSynced ?? null,
    last_sync_error: syncRow?.lastSyncError ?? null,
  };
}

export const spoolRoutes: FastifyPluginAsync<RouteDeps> = async (app, { ctx }) => {
  app.get("/api/spools", {
    schema: {
      tags: ["Spools"],
      description: "List all locally tracked spools, enriched with filament name from community DB",
      response: { 200: Type.Array(LocalSpoolResponse) },
    },
  }, async () => {
    const rows = ctx.spoolRepo.list();
    const syncByTagId = new Map(
      ctx.syncStateRepo.listAll().map((row) => [row.tagId, row]),
    );
    return rows.map((row) =>
      toLocalSpoolResponse(row, syncByTagId.get(row.tagId), ctx.mapping.byId),
    );
  });

  app.get<{ Params: { tagId: string } }>("/api/spools/:tagId", {
    schema: {
      tags: ["Spools"],
      description: "Fetch a single locally tracked spool by tag id",
      params: Type.Object({ tagId: Type.String({ minLength: 1 }) }),
      response: { 200: LocalSpoolResponse, 404: ErrorResponse },
    },
  }, async (req, reply) => {
    const { tagId } = req.params;
    const row = ctx.spoolRepo.findByTagId(tagId);
    if (!row) {
      reply.code(404);
      return { error: "No spool found with this tag id." };
    }
    const syncRow = ctx.syncStateRepo.findByTagId(tagId);
    return toLocalSpoolResponse(row, syncRow, ctx.mapping.byId);
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
    const scan: Spool = {
      ...body,
      color_hexes: body.color_hexes ?? null,
      remain: body.remain ?? null,
    };
    ctx.spoolService.upsert(scan);
    const row = ctx.spoolRepo.findByTagId(body.uid)!;
    const syncRow = ctx.syncStateRepo.findByTagId(body.uid);
    return toLocalSpoolResponse(row, syncRow, ctx.mapping.byId);
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
    const syncRow = ctx.syncStateRepo.findByTagId(tagId);

    const deleted = ctx.spoolRepo.delete(tagId);
    if (!deleted) {
      reply.code(404);
      return { error: "No spool found with this tag id." };
    }

    if (ctx.config.spoolman.auto_sync && syncRow?.spoolmanSpoolId && ctx.config.spoolman.url) {
      try {
        const client = createSpoolmanClient(ctx.config.spoolman.url);
        await client.deleteSpool(syncRow.spoolmanSpoolId);
      } catch {
        // Best-effort: local spool is already deleted, don't fail the request
      }
    }

    return { ok: true };
  });
};
