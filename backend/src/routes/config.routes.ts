import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";
import { ConfigSchema } from "../config.js";
import type { RouteDeps } from "../context.js";
import { ErrorResponse } from "./schemas.js";

export const configRoutes: FastifyPluginAsync<RouteDeps> = async (app, { ctx }) => {
  app.get("/api/health", {
    schema: {
      tags: ["System"],
      description: "Health check",
      response: { 200: Type.Object({ status: Type.String() }) },
    },
  }, async () => ({ status: "ok" }));

  app.get("/api/config", {
    schema: {
      tags: ["Config"],
      description: "Get the current configuration",
    },
  }, async () => ({ config: ctx.config }));

  app.put("/api/config", {
    schema: {
      tags: ["Config"],
      description: "Replace the full configuration",
      body: ConfigSchema,
      response: { 400: ErrorResponse },
    },
  }, async (req) => {
    await ctx.applyConfig(req.body as Record<string, unknown>);
    return { config: ctx.config };
  });
};
