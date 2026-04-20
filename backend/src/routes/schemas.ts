import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { FastifyReply } from "fastify";

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Stable machine-readable error codes. Clients can switch on `code` to render
 * localized messages, trigger UI flows (e.g. "open Spoolman settings"), or
 * decide to retry. `error` remains a human-readable English string.
 */
export const ErrorCode = {
  NotFound: "not_found",
  Conflict: "conflict",
  NotManual: "not_manual",
  AmsManagedRemain: "ams_managed_remain",
  AmsLoaded: "ams_loaded",
  SpoolmanNotConfigured: "spoolman_not_configured",
  SpoolmanUnreachable: "spoolman_unreachable",
  SpoolmanRequestFailed: "spoolman_request_failed",
  CatalogRefreshFailed: "catalog_refresh_failed",
} as const;
export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ErrorResponse = Type.Object({
  error: Type.String(),
  code: Type.Optional(Type.String()),
});

export function errorBody(error: string, code?: ErrorCodeValue) {
  return code ? { error, code } : { error };
}

export function notFound(reply: FastifyReply, message: string) {
  reply.code(404);
  return errorBody(message, ErrorCode.NotFound);
}

export function conflict(reply: FastifyReply, message: string, code: ErrorCodeValue) {
  reply.code(409);
  return errorBody(message, code);
}

export const OkResponse = Type.Object({
  ok: Type.Boolean(),
});

const NullableString = Type.Union([Type.String(), Type.Null()]);
const NullableNumber = Type.Union([Type.Number(), Type.Null()]);

const MatchTypeEnum = Type.Union([
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

export const SpoolHistoryEventPatchSchema = Type.Object({
  remain: Type.Union([Type.Integer({ minimum: 0, maximum: 100 }), Type.Null()]),
});
export type SpoolHistoryEventPatch = Static<typeof SpoolHistoryEventPatchSchema>;

export const SpoolHistoryEventTypeEnum = Type.Union([
  Type.Literal("ams_load"),
  Type.Literal("ams_unload"),
  Type.Literal("ams_update"),
  Type.Literal("scan"),
  Type.Literal("adjust"),
]);

export const SpoolHistoryEventSchema = Type.Object({
  id: Type.Integer(),
  tag_id: Type.String(),
  event_type: SpoolHistoryEventTypeEnum,
  printer_serial: NullableString,
  ams_id: Type.Union([Type.Integer(), Type.Null()]),
  slot_id: Type.Union([Type.Integer(), Type.Null()]),
  remain: Type.Union([Type.Integer(), Type.Null()]),
  weight: NullableNumber,
  created_at: Type.String(),
});

export const SpoolHistoryResponseSchema = Type.Object({
  events: Type.Array(SpoolHistoryEventSchema),
  has_more: Type.Boolean(),
  range: Type.Object({ from: Type.String(), to: Type.String() }),
});

const ISO_DATE_TIME_PATTERN =
  "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:?\\d{2})$";

export const SpoolHistoryQuerySchema = Type.Object({
  from: Type.Optional(Type.String({ pattern: ISO_DATE_TIME_PATTERN })),
  to: Type.Optional(Type.String({ pattern: ISO_DATE_TIME_PATTERN })),
  before: Type.Optional(Type.String({ pattern: ISO_DATE_TIME_PATTERN })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 5000 })),
});
export type SpoolHistoryQuery = Static<typeof SpoolHistoryQuerySchema>;

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
  first_seen: Type.String(),
  last_updated: Type.String(),
  sync: SyncStateSchema,
});

