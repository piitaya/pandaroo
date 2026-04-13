import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";
import type { Mapping } from "../filament-catalog.js";
import { ErrorResponse, errorMessage } from "./schemas.js";

export interface FilamentCatalogRouteDeps {
  mapping: Mapping;
}

export const filamentCatalogRoutes: FastifyPluginAsync<FilamentCatalogRouteDeps> = async (app, { mapping }) => {
  app.post("/api/filament-catalog/refresh", {
    schema: {
      tags: ["Filament catalog"],
      description: "Manually refresh the community filament catalog",
      response: {
        200: Type.Object({ count: Type.Number() }),
        502: ErrorResponse,
      },
    },
  }, async (_req, reply) => {
    try {
      const count = await mapping.refresh();
      return { count };
    } catch (err) {
      reply.code(502);
      return { error: errorMessage(err) };
    }
  });
};
