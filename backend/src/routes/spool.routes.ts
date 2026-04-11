import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";
import { SpoolScanSchema, type SpoolScan } from "../domain/spool.js";
import { matchSpool } from "../domain/matcher.js";
import type { RouteDeps } from "../context.js";
import { scanSpool } from "../services/scan.service.js";
import { SpoolResponse, MatchTypeEnum, LocalSpoolResponse } from "./schemas.js";

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
    return rows.map((row) => {
      const match = matchSpool(
        {
          variant_id: row.variantId,
          material: row.material,
          product: row.product,
        },
        ctx.mapping.byId,
      );
      const syncRow = syncByTagId.get(row.tagId);
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
    });
  });

  app.post("/api/spools/scan", {
    schema: {
      tags: ["Spools"],
      description: "Scan a spool NFC tag, persist locally, and match against the filament database",
      body: SpoolScanSchema,
      response: {
        200: Type.Object({
          spool: SpoolResponse,
          match: MatchTypeEnum,
        }),
      },
    },
  }, async (req) => {
    return scanSpool(
      req.body as SpoolScan,
      ctx.mapping.byId,
      ctx.spoolService,
    );
  });
};
