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
): ConfigStore {
  let config = initialConfig;

  return {
    get current() {
      return config;
    },
    async apply(next) {
      const validated = await saveConfig(configFilePath, next);
      config = validated;
      bus.emit("config:changed", config);
    },
  };
}
