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
      operationId: "getHealth",
      tags: ["System"],
      description: "Health check.",
      response: { 200: Type.Object({ status: Type.String() }) },
    },
  }, async () => ({ status: "ok" }));

  app.get("/api/config", {
    schema: {
      operationId: "getConfig",
      tags: ["Config"],
      description: "Get the configuration.",
      response: { 200: ConfigSchema },
    },
  }, async () => configStore.current);

  app.put("/api/config", {
    schema: {
      operationId: "putConfig",
      tags: ["Config"],
      description: "Replace the configuration.",
      body: ConfigSchema,
      response: { 200: ConfigSchema, 400: ErrorResponse },
    },
  }, async (req) => {
    await configStore.apply(req.body as Record<string, unknown>);
    return configStore.current;
  });
};
