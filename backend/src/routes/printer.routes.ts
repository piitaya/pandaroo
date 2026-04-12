import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";
import { PrinterSchema } from "../config.js";
import type { RouteDeps } from "../context.js";
import { ErrorResponse, OkResponse } from "./schemas.js";

const PrinterUpdateSchema = Type.Partial(PrinterSchema);
const SerialParams = Type.Object({ serial: Type.String() });

export const printerRoutes: FastifyPluginAsync<RouteDeps> = async (app, { ctx }) => {
  app.get("/api/printers", {
    schema: { tags: ["Printers"], description: "List all configured printers" },
  }, async () => ctx.config.printers);

  app.post("/api/printers", {
    schema: {
      tags: ["Printers"],
      description: "Add a new printer",
      body: PrinterSchema,
      response: { 409: ErrorResponse },
    },
  }, async (req, reply) => {
    const printer = req.body as typeof ctx.config.printers[number];
    const { config } = ctx;
    if (config.printers.some((p) => p.serial === printer.serial)) {
      reply.code(409);
      return { error: "A printer with this serial already exists." };
    }
    await ctx.applyConfig({
      ...config,
      printers: [...config.printers, printer],
    });
    return printer;
  });

  app.patch<{ Params: { serial: string } }>("/api/printers/:serial", {
    schema: {
      tags: ["Printers"],
      description: "Update an existing printer",
      params: SerialParams,
      body: PrinterUpdateSchema,
      response: { 404: ErrorResponse, 409: ErrorResponse },
    },
  }, async (req, reply) => {
    const body = req.body as Partial<typeof ctx.config.printers[number]>;
    const { config } = ctx;
    const idx = config.printers.findIndex(
      (p) => p.serial === req.params.serial,
    );
    if (idx === -1) {
      reply.code(404);
      return { error: "No printer found with this serial." };
    }
    if (
      body.serial != null &&
      body.serial !== req.params.serial &&
      config.printers.some(
        (p, i) => i !== idx && p.serial === body.serial,
      )
    ) {
      reply.code(409);
      return { error: "A printer with this serial already exists." };
    }
    const updated = { ...config.printers[idx], ...body };
    const printers = [...config.printers];
    printers[idx] = updated;
    await ctx.applyConfig({ ...config, printers });
    return updated;
  });

  app.delete<{ Params: { serial: string } }>("/api/printers/:serial", {
    schema: {
      tags: ["Printers"],
      description: "Remove a printer",
      params: SerialParams,
      response: { 200: OkResponse, 404: ErrorResponse },
    },
  }, async (req, reply) => {
    const { config } = ctx;
    if (!config.printers.some((p) => p.serial === req.params.serial)) {
      reply.code(404);
      return { error: "not found" };
    }
    await ctx.applyConfig({
      ...config,
      printers: config.printers.filter(
        (p) => p.serial !== req.params.serial,
      ),
    });
    return { ok: true };
  });
};
