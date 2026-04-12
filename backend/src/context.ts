import type { FastifyBaseLogger } from "fastify";
import type Database from "better-sqlite3";
import { saveConfig, type Config } from "./config.js";
import type { Mapping } from "./mapping.js";
import {
  createPrinterConnectionPool,
  disconnectAll,
  syncPrinters,
  type PrinterConnectionPool,
} from "./clients/bambu.client.js";
import type { AppDatabase } from "./db/database.js";
import { createSpoolRepository } from "./db/spool.repository.js";
import { createSyncStateRepository } from "./db/sync-state.repository.js";
import {
  createSpoolService,
  type SpoolService,
} from "./services/spool.service.js";
import { createAmsService } from "./services/ams.service.js";
import { createSpoolmanSync } from "./services/spoolman-auto-sync.js";
import { createEventBus, type AppEventBus } from "./events.js";
import type { SyncDeps } from "./sync.js";

export interface AppContext {
  readonly config: Config;
  readonly spoolService: SpoolService;
  readonly mapping: Mapping;
  readonly printerConnections: PrinterConnectionPool;
  readonly bus: AppEventBus;
  createSyncDeps(): SyncDeps;
  applyConfig(next: Record<string, unknown>): Promise<void>;
  syncFromConfig(): void;
  shutdown(): Promise<void>;
}

export interface RouteDeps {
  ctx: AppContext;
}

export function createAppContext(
  initialConfig: Config,
  configFilePath: string,
  db: AppDatabase,
  sqlite: Database.Database,
  mapping: Mapping,
  log: FastifyBaseLogger,
): AppContext {
  const bus = createEventBus();
  const printerConnections = createPrinterConnectionPool();
  const spoolRepo = createSpoolRepository(db);
  const syncStateRepo = createSyncStateRepository(db);
  const spoolService = createSpoolService(spoolRepo, syncStateRepo, mapping, bus);

  createAmsService(bus);

  bus.on("slot:changed", (spool) => {
    const now = new Date().toISOString();
    spoolService.upsert(spool, { lastUsed: now });
  });

  bus.on("printer:status", (printer, status) => {
    log.info(
      { serial: printer.serial, name: printer.name, status },
      "printer status",
    );
  });

  let config = initialConfig;
  let currentSpoolmanSync: ReturnType<typeof createSpoolmanSync> | null = null;

  const ctx: AppContext = {
    get config() { return config; },
    spoolService,
    mapping,
    printerConnections,
    bus,

    createSyncDeps() {
      return {
        spoolRepo,
        syncStateRepo,
        mapping: mapping.byId,
        spoolmanUrl: config.spoolman.url ?? "",
        archiveOnEmpty: config.spoolman.archive_on_empty ?? false,
      };
    },

    syncFromConfig() {
      mapping.setInterval(config.mapping.refresh_interval_hours);

      currentSpoolmanSync?.stop();
      currentSpoolmanSync = createSpoolmanSync(
        ctx.createSyncDeps(),
        () => ({
          autoSync: config.spoolman.auto_sync,
          url: config.spoolman.url,
        }),
        log,
        bus,
      );

      syncPrinters(config.printers, printerConnections, bus);
    },

    async applyConfig(next) {
      const validated = await saveConfig(configFilePath, next);
      config = validated;
      ctx.syncFromConfig();
    },

    async shutdown() {
      currentSpoolmanSync?.stop();
      await disconnectAll(printerConnections);
      mapping.stop();
      sqlite.close();
    },
  };

  return ctx;
}
