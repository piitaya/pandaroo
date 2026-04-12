import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { SpoolData, AmsSlot, MatchType, FilamentEntry } from "@bambu-spoolman-sync/shared";
import { dataDir } from "./config.js";

export type { FilamentEntry };

export const FilamentEntrySchema = Type.Object({
  id: Type.String(),
  code: Type.Optional(Type.String()),
  material: Type.Optional(Type.String()),
  color_name: Type.Optional(Type.String()),
  color_hex: Type.Optional(Type.String()),
  spoolman_id: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

export const FilamentsFileSchema = Type.Array(FilamentEntrySchema);

export interface MatchResult {
  type: MatchType;
  entry?: FilamentEntry;
}

export function matchSpool(
  spool: Pick<SpoolData, "variant_id" | "material" | "product">,
  mapping: Map<string, FilamentEntry>,
): MatchResult {
  const hasInfo = !!spool.material || !!spool.variant_id || !!spool.product;
  if (!hasInfo) return { type: "unknown_spool" };
  if (!spool.variant_id) return { type: "third_party" };
  const entry = mapping.get(spool.variant_id);
  if (!entry) return { type: "unknown_variant" };
  if (!entry.spoolman_id) return { type: "known_unmapped", entry };
  return { type: "matched", entry };
}

export function matchSlot(
  slot: AmsSlot,
  mapping: Map<string, FilamentEntry>,
): MatchResult {
  if (!slot.has_spool) return { type: "empty" };
  if (!slot.spool) return { type: "unknown_spool" };
  return matchSpool(slot.spool, mapping);
}

export interface MappingOptions {
  url: string;
  cachePath: string;
  intervalHours: number;
  onError?: (err: unknown) => void;
}

export interface Mapping {
  readonly byId: Map<string, FilamentEntry>;
  readonly fetchedAt: Date | null;
  refresh(): Promise<number>;
  setInterval(hours: number): void;
  stop(): void;
}

export function mappingCachePath(): string {
  return resolve(dataDir(), "filaments.json");
}

export async function createMapping(opts: MappingOptions): Promise<Mapping> {
  let byId = new Map<string, FilamentEntry>();
  let fetchedAt: Date | null = null;
  let intervalHours = opts.intervalHours;
  let timer: NodeJS.Timeout | null = null;

  const parseAndSet = (raw: unknown) => {
    if (!Value.Check(FilamentsFileSchema, raw)) {
      throw new Error("Invalid filaments data");
    }
    byId = new Map(raw.map((e) => [e.id, e]));
    return raw.length;
  };

  const loadCache = async (): Promise<Date | null> => {
    try {
      const raw = await readFile(opts.cachePath, "utf-8");
      parseAndSet(JSON.parse(raw));
      const s = await stat(opts.cachePath);
      return s.mtime;
    } catch {
      return null;
    }
  };

  const refresh = async (): Promise<number> => {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(opts.url, { signal: ctrl.signal });
      if (!res.ok) {
        throw new Error(`mapping fetch ${res.status} ${res.statusText}`);
      }
      const json = await res.json();
      const count = parseAndSet(json);
      fetchedAt = new Date();
      await mkdir(dirname(opts.cachePath), { recursive: true });
      await writeFile(opts.cachePath, JSON.stringify(json, null, 2), "utf-8");
      return count;
    } finally {
      clearTimeout(timeout);
    }
  };

  const scheduleNext = () => {
    if (timer) clearInterval(timer);
    const ms = intervalHours * 3_600_000;
    timer = setInterval(() => {
      refresh().catch((err) => opts.onError?.(err));
    }, ms);
    timer.unref?.();
  };

  const cachedAt = await loadCache();
  fetchedAt = cachedAt;
  const stale =
    !cachedAt || Date.now() - cachedAt.getTime() > intervalHours * 3_600_000;
  if (stale) {
    try {
      await refresh();
    } catch (err) {
      opts.onError?.(err);
    }
  }
  scheduleNext();

  return {
    get byId() {
      return byId;
    },
    get fetchedAt() {
      return fetchedAt;
    },
    refresh,
    setInterval(hours: number) {
      if (hours === intervalHours) return;
      intervalHours = hours;
      scheduleNext();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
