import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";
import type { RouteDeps } from "../context.js";
import { ErrorResponse } from "./schemas.js";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const mappingRoutes: FastifyPluginAsync<RouteDeps> = async (app, { ctx }) => {
  app.post("/api/mapping/refresh", {
    schema: {
      tags: ["Mapping"],
      description: "Manually refresh the community filament mapping",
      response: {
        200: Type.Object({ count: Type.Number() }),
        502: ErrorResponse,
      },
    },
  }, async (_req, reply) => {
    try {
      const count = await ctx.mapping.refresh();
      return { count };
    } catch (err) {
      reply.code(502);
      return { error: errorMessage(err) };
    }
  });
};
