import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";
import { SpoolScanSchema, type SpoolScan } from "../domain/spool.js";
import { matchSpool, type FilamentEntry } from "../domain/matcher.js";
import type { RouteDeps } from "../context.js";
import type { SpoolRow } from "../db/spool.repository.js";
import type { SpoolSyncStateRow } from "../db/sync-state.repository.js";
import { ErrorResponse, LocalSpoolResponse } from "./schemas.js";

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

  app.post("/api/spools", {
    schema: {
      tags: ["Spools"],
      description: "Add a spool from a scanned NFC tag, persist locally, and return the enriched local spool",
      body: SpoolScanSchema,
      response: { 200: LocalSpoolResponse },
    },
  }, async (req) => {
    const scan = req.body as SpoolScan;
    ctx.spoolService.upsert(scan);
    const row = ctx.spoolRepo.findByTagId(scan.uid)!;
    const syncRow = ctx.syncStateRepo.findByTagId(scan.uid);
    return toLocalSpoolResponse(row, syncRow, ctx.mapping.byId);
  });
};
