import type { SpoolReading } from "@bambu-spoolman-sync/shared";
import type { ParsedSlot, ParsedAmsUnit } from "./types.js";

export function toSpoolReading(tray: unknown): SpoolReading | null {
  const t = tray as Record<string, unknown> | null;

  const rawUuid = t?.tray_uuid as string | undefined;
  const tag_id = rawUuid && !/^0+$/.test(rawUuid) ? rawUuid : null;

  const rawCols = t?.cols;
  const colorHexes = Array.isArray(rawCols)
    ? (rawCols as unknown[]).filter((c): c is string => typeof c === "string")
    : null;

  const hasInfo =
    !!tag_id || !!t?.tray_id_name || !!t?.tray_type || !!t?.tray_sub_brands;
  if (!hasInfo) return null;

  const rawWeight = (t?.tray_weight as string) ?? null;
  const weight = rawWeight && rawWeight !== "0" ? Number(rawWeight) : null;
  const rawRemain = t?.remain != null ? Number(t.remain) : null;
  const remain = rawRemain != null && rawRemain >= 0 ? rawRemain : null;

  return {
    tag_id,
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

export function decodeNozzleId(info: unknown): number | null {
  if (info == null) return null;
  const parsed = parseInt(String(info), 16);
  if (!Number.isFinite(parsed)) return null;
  const id = (parsed >> 8) & 0xf;
  if (id === 0xe) return null;
  return id;
}

function parseHexBits(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const n = parseInt(value, 16);
  return Number.isFinite(n) ? n : null;
}

export function parseAmsReport(
  printerSerial: string,
  payload: unknown,
): ParsedAmsUnit[] {
  const amsPayload = (payload as any)?.print?.ams;
  const trayExistBits = parseHexBits(amsPayload?.tray_exist_bits);
  const amsList = amsPayload?.ams;
  if (!Array.isArray(amsList)) return [];

  const units: ParsedAmsUnit[] = [];
  for (const ams of amsList) {
    const amsId = Number(ams?.id ?? 0);
    const nozzleId = decodeNozzleId(ams?.info);
    const trays: unknown[] = Array.isArray(ams?.tray) ? ams.tray : [];
    const slots = trays.map((tray) => {
      const t = tray as Record<string, unknown> | null;
      const slotId = Number(t?.id ?? 0);
      const globalBit = amsId * 4 + slotId;
      const hasSpool =
        trayExistBits != null
          ? ((trayExistBits >> globalBit) & 1) === 1
          : true;
      return {
        printer_serial: printerSerial,
        ams_id: amsId,
        slot_id: slotId,
        nozzle_id: nozzleId,
        has_spool: hasSpool,
        spool: hasSpool ? toSpoolReading(tray) : null,
      };
    });
    slots.sort((a, b) => a.slot_id - b.slot_id);
    units.push({ id: amsId, nozzle_id: nozzleId, slots });
  }
  return units;
}
