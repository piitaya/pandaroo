import type { FastifyInstance } from "fastify";
import type { ZodError } from "zod";
import {
  ConfigSchema,
  PrinterSchema,
  saveConfig,
  type Config
} from "./config.js";
import { matchSlot } from "./matcher.js";
import { listRuntimes } from "./mqtt.js";
import {
  createSpoolmanClient,
  getSlotSyncView,
  syncAll,
  syncSlot
} from "./spoolman.js";
import type { AppContext } from "./server.js";

// Turn a Zod validation failure into a single human-readable string so
// the frontend can drop it straight into a toast. `parsed.error.format()`
// returns a deeply-nested object, which is unhelpful for end users.
const zodMessage = (err: ZodError): string =>
  err.issues
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
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
  ctx: AppContext
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
      printers: [...ctx.config.printers, printer]
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
        (p) => p.serial === req.params.serial
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
          (p, i) => i !== idx && p.serial === parsed.data.serial
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
    }
  );

  app.delete<{ Params: { serial: string } }>(
    "/api/printers/:serial",
    async (req, reply) => {
      if (
        !ctx.config.printers.some((p) => p.serial === req.params.serial)
      ) {
        reply.code(404);
        return { error: "not found" };
      }
      await applyConfig({
        ...ctx.config,
        printers: ctx.config.printers.filter(
          (p) => p.serial !== req.params.serial
        )
      });
      return { ok: true };
    }
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
    try {
      const client = createSpoolmanClient(url);
      const [info, base_url] = await Promise.all([
        client.getInfo(),
        client.getBaseUrl()
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
    }
  );

  app.get("/api/state", async () => {
    const runtimes = listRuntimes(ctx.mqttState);
    const bySerial = new Map(runtimes.map((r) => [r.printer.serial, r]));
    const printers = ctx.config.printers.map((p) => {
      const runtime = bySerial.get(p.serial);
      const slots = (runtime?.slots ?? []).map((slot) => ({
        slot,
        ...matchSlot(slot, ctx.mapping.byId),
        sync: getSlotSyncView(ctx.syncState, slot)
      }));
      return {
        serial: p.serial,
        name: p.name,
        enabled: p.enabled,
        status: runtime?.status ?? { lastError: null, errorCode: null },
        slots
      };
    });

    return {
      printers,
      mapping: {
        count: ctx.mapping.byId.size,
        fetched_at: ctx.mapping.fetchedAt
      }
    };
  });
}
