import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const ErrorResponse = Type.Object({
  error: Type.String(),
});

export const OkResponse = Type.Object({
  ok: Type.Boolean(),
});

export const NullableString = Type.Union([Type.String(), Type.Null()]);
export const NullableNumber = Type.Union([Type.Number(), Type.Null()]);

export const MatchTypeEnum = Type.Union([
  Type.Literal("mapped"),
  Type.Literal("unmapped"),
  Type.Literal("unknown_variant"),
  Type.Literal("third_party"),
  Type.Literal("unidentified"),
  Type.Literal("empty"),
]);

const SyncStateSchema = Type.Union([
  Type.Object({ status: Type.Literal("never") }),
  Type.Object({
    status: Type.Literal("synced"),
    spoolman_spool_id: Type.Integer(),
    at: Type.String(),
  }),
  Type.Object({
    status: Type.Literal("stale"),
    spoolman_spool_id: Type.Integer(),
    at: Type.String(),
  }),
  Type.Object({
    status: Type.Literal("error"),
    error: Type.String(),
  }),
]);

export const SpoolPatchSchema = Type.Object({
  remain: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })),
});
export type SpoolPatch = Static<typeof SpoolPatchSchema>;

export const SpoolScanSchema = Type.Object({
  uid: Type.String({ minLength: 1 }),
  variant_id: Type.String(),
  material: Type.String(),
  product: Type.String(),
  color_hex: Type.String(),
  weight: Type.Number(),
  temp_min: Type.Number(),
  temp_max: Type.Number(),
  color_hexes: Type.Optional(Type.Union([Type.Array(Type.String()), Type.Null()])),
  remain: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
});
export type SpoolScan = Static<typeof SpoolScanSchema>;

export function parseSpoolScan(data: unknown): { success: true; data: SpoolScan } | { success: false; error: string } {
  const coerced = Value.Default(SpoolScanSchema, data);
  if (Value.Check(SpoolScanSchema, coerced)) {
    return { success: true, data: coerced };
  }
  const errors = [...Value.Errors(SpoolScanSchema, coerced)];
  const message = errors.map((e) => e.path ? `${e.path}: ${e.message}` : e.message).join("; ");
  return { success: false, error: message };
}

export const LocalSpoolResponse = Type.Object({
  tag_id: Type.String(),
  variant_id: NullableString,
  match_type: MatchTypeEnum,
  material: NullableString,
  product: NullableString,
  color_hex: NullableString,
  color_hexes: Type.Union([Type.Array(Type.String()), Type.Null()]),
  color_name: NullableString,
  weight: NullableNumber,
  remain: NullableNumber,
  temp_min: NullableNumber,
  temp_max: NullableNumber,
  last_used: NullableString,
  last_printer_serial: NullableString,
  last_ams_id: NullableNumber,
  last_slot_id: NullableNumber,
  first_seen: Type.String(),
  last_updated: Type.String(),
  sync: SyncStateSchema,
});

