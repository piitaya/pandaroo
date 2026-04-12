import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUI from "@fastify/swagger-ui";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { configPath, loadConfig } from "./config.js";
import { createMapping, mappingCachePath } from "./mapping.js";
import { createAppContext } from "./context.js";
import { openDatabase } from "./db/database.js";

import { configRoutes } from "./routes/config.routes.js";
import { printerRoutes } from "./routes/printer.routes.js";
import { mappingRoutes } from "./routes/mapping.routes.js";
import { spoolmanRoutes } from "./routes/spoolman.routes.js";
import { spoolRoutes } from "./routes/spool.routes.js";
import { stateRoutes } from "./routes/state.routes.js";

const MAPPING_SOURCE_URL =
  "https://raw.githubusercontent.com/piitaya/bambu-spoolman-db/main/filaments.json";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "Bambu Spoolman Sync",
        description: "Sync Bambu Lab AMS spool data with Spoolman",
        version: "0.1.0",
      },
    },
  });
  await app.register(fastifySwaggerUI, { routePrefix: "/docs" });

  const cfgPath = configPath();
  const config = await loadConfig(cfgPath);
  const mapping = await createMapping({
    url: MAPPING_SOURCE_URL,
    cachePath: mappingCachePath(),
    intervalHours: config.mapping.refresh_interval_hours,
    onError: (err) => app.log.warn({ err }, "mapping refresh failed"),
  });

  const { db, sqlite } = openDatabase();
  const ctx = createAppContext(config, cfgPath, db, sqlite, mapping, app.log);
  ctx.syncFromConfig();

  await app.register(configRoutes, { ctx });
  await app.register(printerRoutes, { ctx });
  await app.register(mappingRoutes, { ctx });
  await app.register(spoolmanRoutes, { ctx });
  await app.register(spoolRoutes, { ctx });
  await app.register(stateRoutes, { ctx });

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const frontendDist = resolve(__dirname, "../../frontend/dist");
  if (existsSync(frontendDist)) {
    await app.register(fastifyStatic, {
      root: frontendDist,
      prefix: "/",
      wildcard: false,
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api")) {
        reply.code(404).send({ error: "not found" });
        return;
      }
      reply.type("text/html").sendFile("index.html");
    });
  }

  app.addHook("onClose", () => ctx.shutdown());

  return { app, ctx };
}

const isMain =
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const port = Number(process.env.PORT ?? 4000);
  const host = process.env.HOST ?? "0.0.0.0";
  buildApp()
    .then(async ({ app }) => {
      const shutdown = async (signal: string) => {
        app.log.info({ signal }, "shutting down");
        try {
          await app.close();
        } catch (err) {
          app.log.error({ err }, "error during shutdown");
        }
        process.exit(0);
      };
      process.once("SIGINT", () => void shutdown("SIGINT"));
      process.once("SIGTERM", () => void shutdown("SIGTERM"));
      await app.listen({ port, host });
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
