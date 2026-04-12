import { describe, expect, it } from "vitest";
import { matchSlot, matchSpool, type FilamentEntry } from "./mapping.js";
import type { AmsSlot, SpoolData } from "@bambu-spoolman-sync/shared";

const mapping = new Map<string, FilamentEntry>([
  ["A01-B6", { id: "A01-B6", spoolman_id: "bambulab_pla_matte_darkblue" }],
  ["A18-B0", { id: "A18-B0", spoolman_id: null }],
]);

const spool = (over: Partial<SpoolData> = {}): SpoolData => ({
  uid: "UUID1",
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
  spool?: SpoolData | null;
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
    expect(r.type).toBe("matched");
    expect(r.entry?.id).toBe("A01-B6");
  });

  it("returns known_unmapped when variant exists but spoolman_id is null", () => {
    const r = matchSpool(spool({ variant_id: "A18-B0" }), mapping);
    expect(r.type).toBe("known_unmapped");
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

  it("returns unknown_spool when no info at all", () => {
    const r = matchSpool(
      spool({ variant_id: null, material: null, product: null }),
      mapping,
    );
    expect(r.type).toBe("unknown_spool");
  });
});

describe("matchSlot", () => {
  it("returns empty when slot has no spool", () => {
    expect(matchSlot(slot({ has_spool: false }), mapping).type).toBe("empty");
  });

  it("returns unknown_spool when spool is present but has no data", () => {
    expect(
      matchSlot(slot({ spool: null, has_spool: true }), mapping).type,
    ).toBe("unknown_spool");
  });

  it("delegates to matchSpool when spool exists", () => {
    expect(matchSlot(slot(), mapping).type).toBe("matched");
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
