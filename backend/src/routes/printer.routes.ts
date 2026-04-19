import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";
import type { PrinterConfig } from "@bambu-spoolman-sync/shared";
import { PrinterSchema } from "../config.js";
import type { ConfigStore } from "../config-store.js";
import { ErrorCode, ErrorResponse, OkResponse, errorBody } from "./schemas.js";

export interface PrinterRouteDeps {
  configStore: ConfigStore;
}

const PrinterUpdateSchema = Type.Partial(PrinterSchema);
const SerialParams = Type.Object({ serial: Type.String() });

export const printerRoutes: FastifyPluginAsync<PrinterRouteDeps> = async (app, { configStore }) => {
  app.get("/api/printers", {
    schema: {
      operationId: "listPrinters",
      tags: ["Printers"],
      description: "List all configured printers",
      response: { 200: Type.Array(PrinterSchema) },
    },
  }, async () => configStore.current.printers);

  app.post("/api/printers", {
    schema: {
      operationId: "createPrinter",
      tags: ["Printers"],
      description: "Add a new printer",
      body: PrinterSchema,
      response: { 200: PrinterSchema, 409: ErrorResponse },
    },
  }, async (req, reply) => {
    const printer = req.body as PrinterConfig;
    const config = configStore.current;
    if (config.printers.some((p) => p.serial === printer.serial)) {
      reply.code(409);
      return errorBody(
        "A printer with this serial already exists.",
        ErrorCode.Conflict,
      );
    }
    await configStore.apply({
      ...config,
      printers: [...config.printers, printer],
    });
    return printer;
  });

  app.patch<{ Params: { serial: string } }>("/api/printers/:serial", {
    schema: {
      operationId: "updatePrinter",
      tags: ["Printers"],
      description: "Update an existing printer",
      params: SerialParams,
      body: PrinterUpdateSchema,
      response: { 200: PrinterSchema, 404: ErrorResponse, 409: ErrorResponse },
    },
  }, async (req, reply) => {
    const body = req.body as Partial<PrinterConfig>;
    const config = configStore.current;
    const idx = config.printers.findIndex(
      (p) => p.serial === req.params.serial,
    );
    if (idx === -1) {
      reply.code(404);
      return errorBody("No printer found with this serial.", ErrorCode.NotFound);
    }
    if (
      body.serial != null &&
      body.serial !== req.params.serial &&
      config.printers.some(
        (p, i) => i !== idx && p.serial === body.serial,
      )
    ) {
      reply.code(409);
      return errorBody(
        "A printer with this serial already exists.",
        ErrorCode.Conflict,
      );
    }
    const updated = { ...config.printers[idx], ...body };
    const printers = [...config.printers];
    printers[idx] = updated;
    await configStore.apply({ ...config, printers });
    return updated;
  });

  app.delete<{ Params: { serial: string } }>("/api/printers/:serial", {
    schema: {
      operationId: "deletePrinter",
      tags: ["Printers"],
      description: "Remove a printer",
      params: SerialParams,
      response: { 200: OkResponse, 404: ErrorResponse },
    },
  }, async (req, reply) => {
    const config = configStore.current;
    if (!config.printers.some((p) => p.serial === req.params.serial)) {
      reply.code(404);
      return errorBody("No printer found with this serial.", ErrorCode.NotFound);
    }
    await configStore.apply({
      ...config,
      printers: config.printers.filter(
        (p) => p.serial !== req.params.serial,
      ),
    });
    return { ok: true };
  });
};
