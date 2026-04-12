import { describe, expect, it } from "vitest";
import { parseSpoolScan } from "./schemas.js";
import { matchSpool, type FilamentEntry } from "../mapping.js";

const mapping = new Map<string, FilamentEntry>([
  ["A01-B6", { id: "A01-B6", spoolman_id: "bambulab_pla_matte_darkblue" }],
]);

function makeScan(over: Record<string, unknown> = {}) {
  return {
    uid: "TEST",
    variant_id: "A01-B6",
    material: "PLA",
    product: "PLA Matte",
    color_hex: "042F56",
    weight: 1000,
    temp_min: 190,
    temp_max: 230,
    ...over,
  };
}

describe("SpoolScanSchema", () => {
  it("validates a full scan payload", () => {
    const result = parseSpoolScan({
      uid: "CD0758AE6929447C9DED0D6AD848B3C3",
      variant_id: "A01-B6",
      material: "PLA",
      product: "PLA Matte",
      color_hex: "042F56FF",
      weight: 1000,
      temp_min: 190,
      temp_max: 230,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.uid).toBe("CD0758AE6929447C9DED0D6AD848B3C3");
      expect(result.data.variant_id).toBe("A01-B6");
    }
  });

  it("rejects a payload with only uid (missing required fields)", () => {
    const result = parseSpoolScan({ uid: "ABC" });
    expect(result.success).toBe(false);
  });

  it("validates a complete payload with optional fields omitted", () => {
    const result = parseSpoolScan({
      uid: "ABC",
      variant_id: "A01-B6",
      material: "PLA",
      product: "PLA Matte",
      color_hex: "042F56",
      weight: 1000,
      temp_min: 190,
      temp_max: 230,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.remain).toBeUndefined();
      expect(result.data.color_hexes).toBeUndefined();
    }
  });

  it("rejects missing uid", () => {
    expect(parseSpoolScan({ variant_id: "X" }).success).toBe(false);
  });

  it("matches a known variant", () => {
    const result = parseSpoolScan(makeScan({ variant_id: "A01-B6" }));
    expect(result.success).toBe(true);
    if (result.success) {
      const match = matchSpool(result.data, mapping);
      expect(match.type).toBe("matched");
      expect(match.entry?.spoolman_id).toBe("bambulab_pla_matte_darkblue");
    }
  });

  it("returns unknown_variant for unrecognized variant_id", () => {
    const result = parseSpoolScan(makeScan({ variant_id: "X99-Z9" }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(matchSpool(result.data, mapping).type).toBe("unknown_variant");
    }
  });
});
