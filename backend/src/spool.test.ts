import { describe, expect, it } from "vitest";
import { SpoolScanSchema } from "./spool.js";
import { matchSpool, type FilamentEntry } from "./matcher.js";

const mapping = new Map<string, FilamentEntry>([
  ["A01-B6", { id: "A01-B6", spoolman_id: "bambulab_pla_matte_darkblue" }]
]);

describe("SpoolScanSchema", () => {
  it("validates a full scan payload", () => {
    const result = SpoolScanSchema.safeParse({
      uid: "CD0758AE6929447C9DED0D6AD848B3C3",
      variant_id: "A01-B6",
      material: "PLA",
      product: "PLA Matte",
      color_hex: "042F56FF",
      weight: 1000,
      temp_min: 190,
      temp_max: 230
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.uid).toBe("CD0758AE6929447C9DED0D6AD848B3C3");
      expect(result.data.variant_id).toBe("A01-B6");
    }
  });

  it("validates a minimal payload with only uid", () => {
    const result = SpoolScanSchema.safeParse({ uid: "ABC" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.variant_id).toBeNull();
      expect(result.data.material).toBeNull();
    }
  });

  it("rejects missing uid", () => {
    expect(SpoolScanSchema.safeParse({ variant_id: "X" }).success).toBe(false);
  });

  it("matches a known variant", () => {
    const spool = SpoolScanSchema.parse({
      uid: "Y",
      variant_id: "A01-B6"
    });
    const result = matchSpool(spool, mapping);
    expect(result.type).toBe("matched");
    expect(result.entry?.spoolman_id).toBe("bambulab_pla_matte_darkblue");
  });

  it("returns unknown_variant for unrecognized variant_id", () => {
    const spool = SpoolScanSchema.parse({
      uid: "Y",
      variant_id: "X99-Z9"
    });
    expect(matchSpool(spool, mapping).type).toBe("unknown_variant");
  });
});
