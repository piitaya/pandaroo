import { Type } from "@sinclair/typebox";

export const ErrorResponse = Type.Object({
  error: Type.String(),
});

export const OkResponse = Type.Object({
  ok: Type.Boolean(),
});

export const NullableString = Type.Union([Type.String(), Type.Null()]);
export const NullableNumber = Type.Union([Type.Number(), Type.Null()]);

export const SpoolResponse = Type.Object({
  uid: NullableString,
  variant_id: NullableString,
  material: NullableString,
  product: NullableString,
  color_hex: NullableString,
  color_hexes: Type.Union([Type.Array(Type.String()), Type.Null()]),
  weight: NullableNumber,
  temp_min: NullableNumber,
  temp_max: NullableNumber,
  remain: NullableNumber,
});

export const MatchTypeEnum = Type.Union([
  Type.Literal("matched"),
  Type.Literal("known_unmapped"),
  Type.Literal("unknown_variant"),
  Type.Literal("third_party"),
  Type.Literal("unknown_spool"),
  Type.Literal("empty"),
]);

export const LocalSpoolResponse = Type.Object({
  tag_id: Type.String(),
  variant_id: NullableString,
  match_type: MatchTypeEnum,
  material: NullableString,
  product: NullableString,
  color_hex: NullableString,
  color_name: NullableString,
  weight: NullableNumber,
  remain: Type.Union([Type.Integer(), Type.Null()]),
  last_used: NullableString,
  first_seen: Type.String(),
  last_updated: Type.String(),
  last_synced: NullableString,
  last_sync_error: NullableString,
});

