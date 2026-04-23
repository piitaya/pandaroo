import { readFile, stat } from "node:fs/promises";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type {
  SpoolReading,
  SlotMatchType,
  SpoolMatchType,
  CatalogEntry,
} from "@pandaroo/shared";
import type { ParsedSlot } from "./clients/bambu/types.js";
import { atomicWriteFile } from "./utils/atomic-write.js";

const NullableString = Type.Union([Type.String(), Type.Null()]);
const NullableNumber = Type.Union([Type.Number(), Type.Null()]);

export const CatalogEntrySchema = Type.Object({
  id: Type.String(),
  sku: Type.String(),
  material: NullableString,
  product: Type.String(),
  color_name: Type.String(),
  color_hex: Type.String(),
  color_hexes: Type.Array(Type.String()),
  weight: NullableNumber,
  temp_min: NullableNumber,
  temp_max: NullableNumber,
  integrations: Type.Record(Type.String(), NullableString),
});

const FilamentsFileSchema = Type.Array(CatalogEntrySchema);

interface SpoolMatchResult {
  type: SpoolMatchType;
  entry?: CatalogEntry;
}

interface SlotMatchResult {
  type: SlotMatchType;
  entry?: CatalogEntry;
}

export function matchSpool(
  spool: Pick<SpoolReading, "variant_id" | "material" | "product">,
  mapping: Map<string, CatalogEntry>,
): SpoolMatchResult {
  const hasInfo = !!spool.material || !!spool.variant_id || !!spool.product;
  if (!hasInfo) return { type: "unidentified" };
  if (!spool.variant_id) return { type: "third_party" };
  const entry = mapping.get(spool.variant_id);
  if (!entry) return { type: "unknown" };
  return { type: "known", entry };
}

export function matchSlot(
  slot: ParsedSlot,
  mapping: Map<string, CatalogEntry>,
): SlotMatchResult {
  if (!slot.has_spool) return { type: "empty" };
  if (!slot.spool) return { type: "unidentified" };
  return matchSpool(slot.spool, mapping);
}

export interface MappingOptions {
  url: string;
  cachePath: string;
  onError?: (err: unknown) => void;
}

export interface Mapping {
  readonly byId: Map<string, CatalogEntry>;
  readonly fetchedAt: Date | null;
  refresh(): Promise<number>;
  stop(): void;
}

/** Refresh the community catalog once a day. */
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function createMapping(opts: MappingOptions): Promise<Mapping> {
  let byId = new Map<string, CatalogEntry>();
  let fetchedAt: Date | null = null;
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

  let refreshInFlight: Promise<number> | null = null;
  const refresh = async (): Promise<number> => {
    if (refreshInFlight) return refreshInFlight;
    const run = async (): Promise<number> => {
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
        await atomicWriteFile(opts.cachePath, JSON.stringify(json, null, 2));
        return count;
      } finally {
        clearTimeout(timeout);
      }
    };
    refreshInFlight = run().finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  };

  const cachedAt = await loadCache();
  fetchedAt = cachedAt;
  const stale =
    !cachedAt || Date.now() - cachedAt.getTime() > REFRESH_INTERVAL_MS;
  if (stale) {
    try {
      await refresh();
    } catch (err) {
      opts.onError?.(err);
    }
  }
  timer = setInterval(() => {
    refresh().catch((err) => opts.onError?.(err));
  }, REFRESH_INTERVAL_MS);
  timer.unref?.();

  return {
    get byId() {
      return byId;
    },
    get fetchedAt() {
      return fetchedAt;
    },
    refresh,
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
