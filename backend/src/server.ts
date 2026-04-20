import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUI from "@fastify/swagger-ui";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { configPath, dataDir, loadConfig } from "./config.js";
import { createMapping } from "./filament-catalog.js";
import { createServices } from "./composition-root.js";
import { openDatabase } from "./db/database.js";

import { configRoutes } from "./routes/config.routes.js";
import { printerRoutes } from "./routes/printer.routes.js";
import { printerStatusRoutes } from "./routes/printer-status.routes.js";
import { filamentCatalogRoutes } from "./routes/filament-catalog.routes.js";
import { spoolmanRoutes } from "./routes/spoolman.routes.js";
import { spoolRoutes } from "./routes/spool.routes.js";
import { eventsRoutes } from "./routes/events.routes.js";

const MAPPING_SOURCE_URL =
  "https://raw.githubusercontent.com/piitaya/bambu-spoolman-db/main/filaments.json";

export async function buildApp() {
  const useJsonLogs = process.env.LOG_FORMAT === "json";
  const app = Fastify({
    disableRequestLogging: true,
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      ...(!useJsonLogs && {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            singleLine: true,
            ignore: "pid,hostname",
          },
        },
      }),
    },
  });

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "Bambu Spoolman Sync",
        description:
          "Sync Bambu Lab AMS spool data with Spoolman.\n\n" +
          "No auth, no rate limiting — LAN only. Put behind an authenticated reverse proxy for remote access.",
        version: "0.1.0",
      },
    },
  });
  await app.register(fastifySwaggerUI, { routePrefix: "/docs" });

  const cfgPath = configPath();
  const config = await loadConfig(cfgPath);
  const mapping = await createMapping({
    url: MAPPING_SOURCE_URL,
    cachePath: resolve(dataDir(), "filaments.json"),
    onError: (err) => app.log.warn({ err }, "Mapping refresh failed"),
  });

  const { db, sqlite } = openDatabase(undefined, app.log.child({ module: "db" }));
  const services = createServices(config, cfgPath, db, sqlite, mapping, app.log);
  services.startAll();

  await app.register(configRoutes, { configStore: services.configStore });
  await app.register(printerRoutes, { configStore: services.configStore });
  await app.register(filamentCatalogRoutes, { mapping: services.mapping });
  await app.register(spoolmanRoutes, {
    configStore: services.configStore,
    spoolService: services.spoolService,
    createSyncDeps: services.createSyncDeps,
  });
  await app.register(spoolRoutes, {
    configStore: services.configStore,
    spoolService: services.spoolService,
    spoolHistoryService: services.spoolHistoryService,
  });
  await app.register(printerStatusRoutes, {
    configStore: services.configStore,
    mapping: services.mapping,
    printerPool: services.printerPool,
  });
  await app.register(eventsRoutes, { bus: services.bus });

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

  app.addHook("onClose", () => services.stopAll());

  return { app, services };
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
        app.log.info({ signal }, "Shutting down");
        try {
          await app.close();
        } catch (err) {
          app.log.error({ err }, "Error during shutdown");
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
