import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";
import { ConfigSchema } from "../config.js";
import type { ConfigStore } from "../config-store.js";
import { ErrorResponse } from "./schemas.js";

export interface ConfigRouteDeps {
  configStore: ConfigStore;
}

export const configRoutes: FastifyPluginAsync<ConfigRouteDeps> = async (app, { configStore }) => {
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
  }, async () => configStore.current);

  app.put("/api/config", {
    schema: {
      tags: ["Config"],
      description: "Replace the full configuration",
      body: ConfigSchema,
      response: { 400: ErrorResponse },
    },
  }, async (req) => {
    await configStore.apply(req.body as Record<string, unknown>);
    return configStore.current;
  });
};
