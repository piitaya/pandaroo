import type { FastifyInstance } from "fastify";
import type { ZodError } from "zod";
import {
  ConfigSchema,
  PrinterSchema,
  saveConfig,
  type Config,
} from "./config.js";
import { matchSlot, matchSpool } from "./matcher.js";
import { SpoolScanSchema } from "./spool.js";
import { listRuntimes } from "./mqtt.js";
import {
  createSpoolmanClient,
  decodeExtraString,
  getSlotSyncView,
  syncAll,
  syncSlot,
  syncSpool,
} from "./spoolman.js";
import type { AppContext } from "./server.js";

// Turn a Zod validation failure into a single human-readable string so
// the frontend can drop it straight into a toast. `parsed.error.format()`
// returns a deeply-nested object, which is unhelpful for end users.
const zodMessage = (err: ZodError): string =>
  err.issues
    .map((i) =>
      i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message,
    )
    .join("; ");

// Creation accepts every printer field. Update accepts the same set
// and may include a new `serial` — the URL param identifies the
// printer as it currently is; the body describes what it should
// become. Changing the serial triggers an MQTT tear-down + reconnect
// via the existing syncPrinters() reconcile loop; no special path
// is needed in this file.
const PrinterUpdateSchema = PrinterSchema.partial();

export async function registerRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  const applyConfig = async (next: Config) => {
    await saveConfig(ctx.configFilePath, next);
    ctx.config = next;
    ctx.syncFromConfig();
  };

  app.get("/api/health", async () => ({ status: "ok" }));

  app.get("/api/config", async () => ({ config: ctx.config }));

  app.put("/api/config", async (req, reply) => {
    const parsed = ConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: zodMessage(parsed.error) };
    }
    await applyConfig(parsed.data);
    return { config: ctx.config };
  });

  app.get("/api/printers", async () => ctx.config.printers);

  app.post("/api/printers", async (req, reply) => {
    const parsed = PrinterSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: zodMessage(parsed.error) };
    }
    const printer = parsed.data;
    if (ctx.config.printers.some((p) => p.serial === printer.serial)) {
      reply.code(409);
      return { error: "A printer with this serial already exists." };
    }
    await applyConfig({
      ...ctx.config,
      printers: [...ctx.config.printers, printer],
    });
    return printer;
  });

  app.patch<{ Params: { serial: string } }>(
    "/api/printers/:serial",
    async (req, reply) => {
      const parsed = PrinterUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: zodMessage(parsed.error) };
      }
      const idx = ctx.config.printers.findIndex(
        (p) => p.serial === req.params.serial,
      );
      if (idx === -1) {
        reply.code(404);
        return { error: "No printer found with this serial." };
      }
      // If the body is changing the serial, make sure the new one
      // isn't already used by a *different* printer.
      if (
        parsed.data.serial != null &&
        parsed.data.serial !== req.params.serial &&
        ctx.config.printers.some(
          (p, i) => i !== idx && p.serial === parsed.data.serial,
        )
      ) {
        reply.code(409);
        return { error: "A printer with this serial already exists." };
      }
      const updated = { ...ctx.config.printers[idx], ...parsed.data };
      const printers = [...ctx.config.printers];
      printers[idx] = updated;
      await applyConfig({ ...ctx.config, printers });
      return updated;
    },
  );

  app.delete<{ Params: { serial: string } }>(
    "/api/printers/:serial",
    async (req, reply) => {
      if (!ctx.config.printers.some((p) => p.serial === req.params.serial)) {
        reply.code(404);
        return { error: "not found" };
      }
      await applyConfig({
        ...ctx.config,
        printers: ctx.config.printers.filter(
          (p) => p.serial !== req.params.serial,
        ),
      });
      return { ok: true };
    },
  );

  app.post("/api/mapping/refresh", async (_req, reply) => {
    try {
      const count = await ctx.mapping.refresh();
      return { count };
    } catch (err) {
      reply.code(502);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.post("/api/spoolman/test", async (_req, reply) => {
    const url = ctx.config.spoolman?.url;
    if (!url) {
      reply.code(400);
      return { error: "Spoolman URL is not configured." };
    }
    // Fail fast when the instance is unreachable: 3s covers a healthy
    // LAN round-trip comfortably, and avoids users staring at a
    // spinner for undici's default 10s connect timeout.
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
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.post("/api/spoolman/sync", async (_req, reply) => {
    try {
      return await syncAll(ctx);
    } catch (err) {
      reply.code(400);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.post<{ Params: { serial: string; amsId: string; slotId: string } }>(
    "/api/spoolman/sync/:serial/:amsId/:slotId",
    async (req, reply) => {
      const amsId = Number(req.params.amsId);
      const slotId = Number(req.params.slotId);
      if (!Number.isFinite(amsId) || !Number.isFinite(slotId)) {
        reply.code(400);
        return { error: "Invalid amsId or slotId." };
      }
      try {
        return await syncSlot(ctx, req.params.serial, amsId, slotId);
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  app.post("/api/spools/scan", async (req, reply) => {
    const parsed = SpoolScanSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: zodMessage(parsed.error) };
    }
    const spool = parsed.data;
    const match = matchSpool(spool, ctx.mapping.byId);

    // Enrich with weight data from Spoolman if the spool was
    // previously synced (looked up by extra.tag === uid).
    const spoolmanUrl = ctx.config.spoolman?.url;
    let synced = false;
    let archived = false;
    if (spoolmanUrl && spool.uid) {
      try {
        const client = createSpoolmanClient(spoolmanUrl);
        const all = await client.listSpools();
        const found = all.find(
          (s) => decodeExtraString(s.extra?.tag) === spool.uid,
        );
        if (found) {
          synced = true;
          archived = found.archived ?? false;
          if (found.used_weight != null && spool.weight != null) {
            const total = Number(spool.weight);
            const remaining = Math.max(0, total - found.used_weight);
            spool.remain =
              total > 0 ? Math.round((remaining / total) * 100) : 0;
          }
        }
      } catch {
        // Spoolman unreachable — return spool without weight enrichment
      }
    }

    return {
      spool,
      match: match.type,
      sync_available: !!spoolmanUrl,
      synced,
      archived,
    };
  });

  app.post("/api/spools/sync", async (req, reply) => {
    const parsed = SpoolScanSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: zodMessage(parsed.error) };
    }
    const url = ctx.config.spoolman?.url;
    if (!url) {
      reply.code(400);
      return { error: "Spoolman URL is not configured." };
    }
    const spool = parsed.data;
    try {
      await syncSpool(spool, ctx.mapping.byId, url, {
        archiveOnEmpty: ctx.config.spoolman?.archive_on_empty ?? false,
      });
      return { success: true };
    } catch (err) {
      reply.code(400);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.get("/api/state", async () => {
    const runtimes = listRuntimes(ctx.mqttState);
    const bySerial = new Map(runtimes.map((r) => [r.printer.serial, r]));
    const printers = ctx.config.printers.map((p) => {
      const runtime = bySerial.get(p.serial);
      const ams_units = (runtime?.ams_units ?? []).map((unit) => ({
        id: unit.id,
        nozzle_id: unit.nozzle_id,
        slots: unit.slots.map((slot) => ({
          slot,
          ...matchSlot(slot, ctx.mapping.byId),
          sync: getSlotSyncView(ctx.syncState, slot),
        })),
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
        count: ctx.mapping.byId.size,
        fetched_at: ctx.mapping.fetchedAt,
      },
    };
  });
}
