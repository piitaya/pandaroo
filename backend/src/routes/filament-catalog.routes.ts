import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";
import type { Mapping } from "../filament-catalog.js";
import { ErrorCode, ErrorResponse, errorBody, errorMessage } from "./schemas.js";

export interface FilamentCatalogRouteDeps {
  mapping: Mapping;
}

export const filamentCatalogRoutes: FastifyPluginAsync<FilamentCatalogRouteDeps> = async (app, { mapping }) => {
  app.get("/api/filament-catalog/status", {
    schema: {
      operationId: "getFilamentCatalogStatus",
      tags: ["Filament catalog"],
      description: "Get filament catalog status",
      response: {
        200: Type.Object({
          count: Type.Number(),
          fetched_at: Type.Union([Type.String(), Type.Null()]),
        }),
      },
    },
  }, async () => ({
    count: mapping.byId.size,
    fetched_at: mapping.fetchedAt?.toISOString() ?? null,
  }));

  app.post("/api/filament-catalog/refresh", {
    schema: {
      operationId: "refreshFilamentCatalog",
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
      return errorBody(errorMessage(err), ErrorCode.CatalogRefreshFailed);
    }
  });
};
