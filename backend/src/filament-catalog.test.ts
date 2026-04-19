import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMapping, matchSlot, matchSpool, type CatalogEntry } from "./filament-catalog.js";
import type { AmsSlot, SpoolReading } from "@bambu-spoolman-sync/shared";

const mapping = new Map<string, CatalogEntry>([
  ["A01-B6", { id: "A01-B6", spoolman_id: "bambulab_pla_matte_darkblue" }],
  ["A18-B0", { id: "A18-B0", spoolman_id: null }],
]);

const spool = (over: Partial<SpoolReading> = {}): SpoolReading => ({
  tag_id: "UUID1",
  variant_id: "A01-B6",
  material: "PLA",
  product: "PLA Matte",
  color_hex: "042F56FF",
  color_hexes: null,
  weight: 1000,
  temp_min: 220,
  temp_max: 240,
  remain: 80,
  ...over,
});

const slot = (over?: {
  spool?: SpoolReading | null;
  has_spool?: boolean;
}): AmsSlot => ({
  printer_serial: "AC12",
  ams_id: 0,
  slot_id: 0,
  nozzle_id: 0,
  has_spool: over?.has_spool ?? true,
  spool: over?.spool !== undefined ? over.spool : spool(),
});

describe("matchSpool", () => {
  it("matches a known variant with a spoolman_id", () => {
    const r = matchSpool(spool(), mapping);
    expect(r.type).toBe("mapped");
    expect(r.entry?.id).toBe("A01-B6");
  });

  it("returns unmapped when variant exists but spoolman_id is null", () => {
    const r = matchSpool(spool({ variant_id: "A18-B0" }), mapping);
    expect(r.type).toBe("unmapped");
  });

  it("returns unknown_variant for an id not in the mapping", () => {
    const r = matchSpool(spool({ variant_id: "ZZ-99" }), mapping);
    expect(r.type).toBe("unknown_variant");
  });

  it("returns third_party when variant_id is missing but other fields exist", () => {
    const r = matchSpool(
      spool({ variant_id: null, product: "Generic PLA" }),
      mapping,
    );
    expect(r.type).toBe("third_party");
  });

  it("returns unidentified when no info at all", () => {
    const r = matchSpool(
      spool({ variant_id: null, material: null, product: null }),
      mapping,
    );
    expect(r.type).toBe("unidentified");
  });
});

describe("matchSlot", () => {
  it("returns empty when slot has no spool", () => {
    expect(matchSlot(slot({ has_spool: false }), mapping).type).toBe("empty");
  });

  it("returns unidentified when spool is present but has no data", () => {
    expect(
      matchSlot(slot({ spool: null, has_spool: true }), mapping).type,
    ).toBe("unidentified");
  });

  it("delegates to matchSpool when spool exists", () => {
    expect(matchSlot(slot(), mapping).type).toBe("mapped");
  });

  it("does not try to match by color or name", () => {
    const r = matchSlot(
      slot({
        spool: spool({ variant_id: "A01-B7", color_hex: "042F56FF" }),
      }),
      mapping,
    );
    expect(r.type).toBe("unknown_variant");
  });
});

describe("createMapping.refresh mutex", () => {
  let tmpDir: string;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "bss-catalog-"));
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("coalesces concurrent refresh() calls into one fetch", async () => {
    // Prime the cache so createMapping's initial load reads from disk and
    // doesn't trigger a network fetch we'd have to unblock.
    const cachePath = join(tmpDir, "filaments.json");
    await writeFile(cachePath, JSON.stringify([{ id: "A01-B6" }]), "utf-8");

    let fetchCount = 0;
    let resolveFetch!: () => void;
    const release = new Promise<void>((resolve) => {
      resolveFetch = resolve;
    });
    globalThis.fetch = vi.fn(async () => {
      fetchCount++;
      await release;
      return new Response(JSON.stringify([{ id: "A01-B6" }, { id: "X-9" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const mapping = await createMapping({
      url: "http://x/filaments.json",
      cachePath,
      intervalHours: 24, // fresh cache => no initial refresh
    });

    // Kick off three concurrent refreshes while the fetch is blocked.
    const a = mapping.refresh();
    const b = mapping.refresh();
    const c = mapping.refresh();
    resolveFetch();
    const results = await Promise.all([a, b, c]);

    expect(results).toEqual([2, 2, 2]);
    // All three callers shared a single in-flight fetch.
    expect(fetchCount).toBe(1);
    mapping.stop();
  });
});
