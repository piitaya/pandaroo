import type { FastifyBaseLogger } from "fastify";
import type Database from "better-sqlite3";
import type { Config } from "@bambu-spoolman-sync/shared";
import type { Mapping } from "./filament-catalog.js";
import type { AppDatabase } from "./db/database.js";
import { createSpoolRepository, type SpoolRepository } from "./db/spool.repository.js";
import { createSyncStateRepository, type SyncStateRepository } from "./db/sync-state.repository.js";
import { createSpoolService, type SpoolService } from "./services/spool.service.js";
import { createAmsChangeDetector, type AmsChangeDetector } from "./services/ams-change-detector.js";
import { createSpoolmanSyncListener, type SpoolmanSyncListener } from "./services/spoolman-sync-listener.js";
import { createEventBus, type AppEventBus } from "./events.js";
import { createConfigStore, type ConfigStore } from "./config-store.js";
import {
  createPrinterConnectionPool,
  disconnectAll,
  syncPrinters,
  type PrinterConnectionPool,
} from "./clients/bambu/index.js";
import type { SyncDeps } from "./spoolman-sync.js";

export interface AppServices {
  readonly configStore: ConfigStore;
  readonly bus: AppEventBus;
  readonly mapping: Mapping;
  readonly spoolService: SpoolService;
  readonly spoolRepo: SpoolRepository;
  readonly syncStateRepo: SyncStateRepository;
  readonly printerPool: PrinterConnectionPool;
  readonly amsDetector: AmsChangeDetector;
  readonly syncListener: SpoolmanSyncListener;

  createSyncDeps(): SyncDeps;
  startAll(): void;
  stopAll(): Promise<void>;
}

export function createServices(
  initialConfig: Config,
  configFilePath: string,
  db: AppDatabase,
  sqlite: Database.Database,
  mapping: Mapping,
  log: FastifyBaseLogger,
): AppServices {
  const bus = createEventBus();

  const mqttLog = log.child({ module: "mqtt" });
  const spoolmanLog = log.child({ module: "spoolman" });
  const spoolLog = log.child({ module: "spool" });
  const amsLog = log.child({ module: "ams" });
  const configLog = log.child({ module: "config" });

  const configStore = createConfigStore(initialConfig, configFilePath, bus, configLog);

  const spoolRepo = createSpoolRepository(db);
  const syncStateRepo = createSyncStateRepository(db);

  const spoolService = createSpoolService({
    spoolRepo,
    syncStateRepo,
    mapping,
    bus,
    log: spoolLog,
  });
  const printerPool = createPrinterConnectionPool();
  const amsDetector = createAmsChangeDetector(bus, amsLog);

  const createSyncDeps = (): SyncDeps => {
    const config = configStore.current;
    return {
      spoolRepo,
      syncStateRepo,
      mapping: mapping.byId,
      spoolmanUrl: config.spoolman.url ?? "",
      archiveOnEmpty: config.spoolman.archive_on_empty ?? false,
      log: spoolmanLog,
    };
  };

  const syncListener = createSpoolmanSyncListener({
    createSyncDeps,
    bus,
    log: spoolmanLog,
    getConfig: () => configStore.current,
  });

  // Cross-service event wiring
  bus.on("spool:detected", (spool, location) => {
    const now = new Date().toISOString();
    spoolService.upsert(spool, { lastUsed: now, location });
  });

  bus.on("printer:status-changed", (printer, status) => {
    mqttLog.info(
      { serial: printer.serial, name: printer.name, status },
      "Printer status",
    );
  });

  bus.on("config:changed", (config) => {
    mapping.setInterval(config.filament_catalog.refresh_interval_hours);
    syncPrinters(config.printers, printerPool, bus, mqttLog);
  });

  log.info({
    printerCount: initialConfig.printers.length,
    spoolmanUrl: initialConfig.spoolman.url ?? null,
    autoSync: initialConfig.spoolman.auto_sync,
  }, "Config loaded");

  return {
    configStore,
    bus,
    mapping,
    spoolService,
    spoolRepo,
    syncStateRepo,
    printerPool,
    amsDetector,
    syncListener,

    createSyncDeps,

    startAll() {
      amsDetector.start();
      syncListener.start();
      const config = configStore.current;
      syncPrinters(config.printers, printerPool, bus, mqttLog);
      log.info("Services started");
    },

    async stopAll() {
      log.info("Services stopping");
      syncListener.stop();
      amsDetector.stop();
      await disconnectAll(printerPool);
      mapping.stop();
      sqlite.close();
      log.info("Services stopped");
    },
  };
}
