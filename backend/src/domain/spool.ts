import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export function computeUsedWeight(weight: number, remain: number): number {
  return Math.max(0, weight * (1 - remain / 100));
}

export function hasUid(spool: Spool): spool is Spool & { uid: string } {
  return !!spool.uid;
}

export interface Spool {
  uid: string | null;
  variant_id: string | null;
  material: string | null;
  product: string | null;
  color_hex: string | null;
  color_hexes: string[] | null;
  weight: number | null;
  temp_min: number | null;
  temp_max: number | null;
  remain: number | null;
}

export interface AmsSlot {
  printer_serial: string;
  ams_id: number;
  slot_id: number;
  nozzle_id: number | null;
  has_spool: boolean;
  spool: Spool | null;
}

export interface AmsUnit {
  id: number;
  nozzle_id: number | null;
  slots: AmsSlot[];
}

export const SpoolScanSchema = Type.Object({
  uid: Type.String({ minLength: 1 }),
  variant_id: Type.Union([Type.String(), Type.Null()], { default: null }),
  material: Type.Union([Type.String(), Type.Null()], { default: null }),
  product: Type.Union([Type.String(), Type.Null()], { default: null }),
  color_hex: Type.Union([Type.String(), Type.Null()], { default: null }),
  color_hexes: Type.Union([Type.Array(Type.String()), Type.Null()], { default: null }),
  weight: Type.Union([Type.Number(), Type.Null()], { default: null }),
  temp_min: Type.Union([Type.Number(), Type.Null()], { default: null }),
  temp_max: Type.Union([Type.Number(), Type.Null()], { default: null }),
  remain: Type.Union([Type.Number(), Type.Null()], { default: null }),
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

/**
 * Parse a raw MQTT tray object into a Spool. Returns null when the
 * tray has no identifiable info (no UID, no variant, no material).
 */
export function toSpool(tray: unknown): Spool | null {
  const t = tray as Record<string, unknown> | null;

  const rawUuid = t?.tray_uuid as string | undefined;
  const uid = rawUuid && !/^0+$/.test(rawUuid) ? rawUuid : null;

  const rawCols = t?.cols;
  const colorHexes = Array.isArray(rawCols)
    ? (rawCols as unknown[]).filter((c): c is string => typeof c === "string")
    : null;

  const hasInfo =
    !!uid || !!t?.tray_id_name || !!t?.tray_type || !!t?.tray_sub_brands;
  if (!hasInfo) return null;

  // Normalize Bambu sentinels at the boundary:
  // tray_weight "0" = no NFC tag data, remain -1 = unknown
  const rawWeight = (t?.tray_weight as string) ?? null;
  const weight = rawWeight && rawWeight !== "0" ? Number(rawWeight) : null;
  const rawRemain = t?.remain != null ? Number(t.remain) : null;
  const remain = rawRemain != null && rawRemain >= 0 ? rawRemain : null;

  return {
    uid,
    variant_id: (t?.tray_id_name as string) ?? null,
    material: (t?.tray_type as string) ?? null,
    product: (t?.tray_sub_brands as string) ?? null,
    color_hex: (t?.tray_color as string) ?? null,
    color_hexes: colorHexes,
    weight,
    temp_min: t?.nozzle_temp_min != null ? Number(t.nozzle_temp_min) : null,
    temp_max: t?.nozzle_temp_max != null ? Number(t.nozzle_temp_max) : null,
    remain,
  };
}
