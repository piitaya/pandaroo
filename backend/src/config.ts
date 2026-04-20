import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { Config } from "@bambu-spoolman-sync/shared";
import { atomicWriteFile } from "./utils/atomic-write.js";

// Keep in sync with the `Config` interface in shared.
export const PrinterSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  host: Type.String({ minLength: 1 }),
  serial: Type.String({ minLength: 1 }),
  access_code: Type.String({ minLength: 1 }),
  enabled: Type.Boolean({ default: true }),
});
export const ConfigSchema = Type.Object({
  printers: Type.Array(PrinterSchema, { default: [] }),
  spoolman: Type.Object(
    {
      url: Type.Optional(Type.String()),
      auto_sync: Type.Boolean({ default: false }),
      archive_on_empty: Type.Boolean({ default: false }),
    },
    { default: {} },
  ),
});

function parseConfig(data: unknown): Config {
  const coerced = Value.Default(ConfigSchema, Value.Clone(data));
  Value.Clean(ConfigSchema, coerced);
  if (!Value.Check(ConfigSchema, coerced)) {
    const errors = [...Value.Errors(ConfigSchema, coerced)];
    throw new Error(
      `Invalid config: ${errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`,
    );
  }
  return coerced;
}

export function dataDir(): string {
  return process.env.DATA_DIR ?? resolve(process.cwd(), "data");
}

export function configPath(): string {
  return resolve(dataDir(), "config.json");
}

export async function loadConfig(path: string): Promise<Config> {
  try {
    const raw = await readFile(path, "utf-8");
    return parseConfig(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return parseConfig({});
    }
    throw err;
  }
}

export async function saveConfig(
  path: string,
  config: Record<string, unknown>,
): Promise<Config> {
  const validated = parseConfig(config);
  await atomicWriteFile(path, JSON.stringify(validated, null, 2));
  return validated;
}
