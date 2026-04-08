import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { configPath, loadConfig, type Config } from "./config.js";
import { createMapping, mappingCachePath, type Mapping } from "./mapping.js";
import { registerRoutes } from "./api.js";
import {
  createMqttState,
  disconnectAll,
  syncPrinters,
  type MqttState,
} from "./mqtt.js";
import {
  createSyncStateStore,
  evaluateSlotForSync,
  syncSlot,
  type SyncStateStore
} from "./spoolman.js";

const MAPPING_SOURCE_URL =
  "https://raw.githubusercontent.com/piitaya/bambu-spoolman-db/main/filaments.json";

export interface AppContext {
  config: Config;
  configFilePath: string;
  mapping: Mapping;
  mqttState: MqttState;
  syncState: SyncStateStore;
  syncFromConfig(): void;
}

export async function buildApp() {
  const app = Fastify({ logger: true });
  const configFilePath = configPath();
  const config = await loadConfig(configFilePath);

  const mapping = await createMapping({
    url: MAPPING_SOURCE_URL,
    cachePath: mappingCachePath(),
    intervalHours: config.mapping.refresh_interval_hours,
    onError: (err) => app.log.warn({ err }, "mapping refresh failed"),
  });

  const mqttState = createMqttState();
  const syncState = createSyncStateStore();

  // Per-slot auto-sync bookkeeping. We track the last-synced tray_uuid
  // and remain% so we only hit Spoolman when something actually changed,
  // and debounce by ~2s because the AMS pushes frequent reports while
  // the printer is busy.
  const lastSyncKey = new Map<string, string>();
  const debounceTimers = new Map<string, NodeJS.Timeout>();
  const slotKey = (serial: string, amsId: number, slotId: number) =>
    `${serial}#${amsId}#${slotId}`;

  const ctx: AppContext = {
    config,
    configFilePath,
    mapping,
    mqttState,
    syncState,
    syncFromConfig() {
      mapping.setInterval(ctx.config.mapping.refresh_interval_hours);
      syncPrinters(
        ctx.config.printers,
        mqttState,
        (printer, status) =>
          app.log.info(
            { serial: printer.serial, name: printer.name, status },
            "printer status",
          ),
        (printer, slots) => {
          if (!ctx.config.spoolman?.auto_sync || !ctx.config.spoolman?.url) {
            return;
          }
          // Trailing-edge debounce with cooldown:
          //   - If nothing is scheduled and signature differs from the
          //     last-synced one, schedule a sync in 2s.
          //   - Subsequent pushes within that window are ignored *if*
          //     the signature is unchanged; the pending timer still
          //     fires with the latest data. Previously we were
          //     clearing and rescheduling on every push, so a chatty
          //     printer (pushes every <2s) could starve the timer
          //     indefinitely — meaning auto-sync never ran.
          for (const slot of slots) {
            const evaluated = evaluateSlotForSync(slot, ctx.mapping.byId);
            if (!evaluated.ok) continue;
            const key = slotKey(printer.serial, slot.ams_id, slot.slot_id);
            const signature = `${slot.tray_uuid}|${slot.remain}`;
            if (lastSyncKey.get(key) === signature) continue;
            if (debounceTimers.has(key)) continue;
            debounceTimers.set(
              key,
              setTimeout(() => {
                debounceTimers.delete(key);
                lastSyncKey.set(key, signature);
                syncSlot(ctx, printer.serial, slot.ams_id, slot.slot_id).catch(
                  (err) => {
                    // Clear the memo on failure so the next push retries.
                    lastSyncKey.delete(key);
                    app.log.warn(
                      {
                        err,
                        serial: printer.serial,
                        ams: slot.ams_id,
                        slot: slot.slot_id,
                      },
                      "auto-sync failed",
                    );
                  },
                );
              }, 2000),
            );
          }
        },
      );
    },
  };

  ctx.syncFromConfig();
  await registerRoutes(app, ctx);

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

  app.addHook("onClose", async () => {
    await disconnectAll(mqttState);
    mapping.stop();
  });

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
