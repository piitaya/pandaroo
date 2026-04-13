import type { FastifyBaseLogger } from "fastify";
import { saveConfig, type Config } from "./config.js";
import type { AppEventBus } from "./events.js";

export interface ConfigStore {
  readonly current: Config;
  apply(next: Record<string, unknown>): Promise<void>;
}

export function createConfigStore(
  initialConfig: Config,
  configFilePath: string,
  bus: AppEventBus,
  log: FastifyBaseLogger,
): ConfigStore {
  let config = initialConfig;

  return {
    get current() {
      return config;
    },
    async apply(next) {
      const validated = await saveConfig(configFilePath, next);
      config = validated;
      log.info({
        printerCount: config.printers.length,
        spoolmanUrl: config.spoolman.url ?? null,
        autoSync: config.spoolman.auto_sync,
      }, "Config saved");
      bus.emit("config:changed", config);
    },
  };
}
