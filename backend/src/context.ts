import type { FastifyBaseLogger } from "fastify";
import type Database from "better-sqlite3";
import { saveConfig, type Config } from "./stores/config.store.js";
import type { Mapping } from "./stores/mapping.store.js";
import {
  createMqttState,
  disconnectAll,
  syncPrinters,
  type MqttState,
} from "./clients/bambu.client.js";
import type { AppDatabase } from "./db/database.js";
import {
  createSpoolRepository,
  type SpoolRepository,
} from "./db/spool.repository.js";
import {
  createSyncStateRepository,
  type SyncStateRepository,
} from "./db/sync-state.repository.js";
import {
  createSpoolService,
  type SpoolService,
} from "./services/spool.service.js";
import { createAmsService } from "./services/ams.service.js";
import { createSpoolmanSync } from "./services/spoolman-sync.service.js";

export interface RouteDeps {
  ctx: AppContext;
}

export class AppContext {
  config: Config;
  readonly spoolRepo: SpoolRepository;
  readonly syncStateRepo: SyncStateRepository;
  readonly spoolService: SpoolService;
  readonly mapping: Mapping;
  readonly mqttState: MqttState;

  private configFilePath: string;
  private log: FastifyBaseLogger;
  private sqlite: Database.Database;
  private currentSpoolmanSync: ReturnType<typeof createSpoolmanSync> | null =
    null;

  constructor(
    config: Config,
    configFilePath: string,
    db: AppDatabase,
    sqlite: Database.Database,
    mapping: Mapping,
    log: FastifyBaseLogger,
  ) {
    this.config = config;
    this.configFilePath = configFilePath;
    this.sqlite = sqlite;
    this.spoolRepo = createSpoolRepository(db);
    this.syncStateRepo = createSyncStateRepository(db);
    this.spoolService = createSpoolService(this.spoolRepo);
    this.mapping = mapping;
    this.log = log;
    this.mqttState = createMqttState();
  }

  syncFromConfig(): void {
    this.mapping.setInterval(this.config.mapping.refresh_interval_hours);

    this.currentSpoolmanSync?.stop();
    const spoolmanSync = createSpoolmanSync(
      {
        spoolRepo: this.spoolRepo,
        syncStateRepo: this.syncStateRepo,
        mapping: this.mapping.byId,
        spoolmanUrl: this.config.spoolman.url ?? "",
        archiveOnEmpty: this.config.spoolman.archive_on_empty ?? false,
      },
      () => ({
        autoSync: this.config.spoolman.auto_sync,
        url: this.config.spoolman.url,
      }),
      this.log,
    );
    this.currentSpoolmanSync = spoolmanSync;
    this.spoolService.setChangeListener(spoolmanSync.onSpoolChange);

    const amsService = createAmsService();
    amsService.setChangeListener((spool) => {
      const now = new Date().toISOString();
      this.spoolService.upsert(spool, { lastUsed: now });
    });

    syncPrinters(
      this.config.printers,
      this.mqttState,
      (printer, status) =>
        this.log.info(
          { serial: printer.serial, name: printer.name, status },
          "printer status",
        ),
      (_printer, ams_units) => amsService.onAmsUpdate(ams_units),
    );
  }

  async applyConfig(next: Record<string, unknown>): Promise<void> {
    const validated = await saveConfig(this.configFilePath, next);
    this.config = validated;
    this.syncFromConfig();
  }

  async shutdown(): Promise<void> {
    this.currentSpoolmanSync?.stop();
    await disconnectAll(this.mqttState);
    this.mapping.stop();
    this.sqlite.close();
  }
}
