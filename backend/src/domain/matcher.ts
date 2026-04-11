import { Type, type Static } from "@sinclair/typebox";
import type { AmsSlot, Spool } from "./spool.js";

export const FilamentEntrySchema = Type.Object({
  id: Type.String(),
  code: Type.Optional(Type.String()),
  material: Type.Optional(Type.String()),
  color_name: Type.Optional(Type.String()),
  color_hex: Type.Optional(Type.String()),
  spoolman_id: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});
export type FilamentEntry = Static<typeof FilamentEntrySchema>;

export const FilamentsFileSchema = Type.Array(FilamentEntrySchema);

export type MatchType =
  | "matched"
  | "known_unmapped"
  | "unknown_variant"
  | "third_party"
  | "unknown_spool"
  | "empty";

export interface MatchResult {
  type: MatchType;
  entry?: FilamentEntry;
}

export function matchSpool(
  spool: Pick<Spool, "variant_id" | "material" | "product">,
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
