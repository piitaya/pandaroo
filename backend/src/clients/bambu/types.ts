import type { SpoolReading } from "@bambu-spoolman-sync/shared";

export interface ParsedSlot {
  printer_serial: string;
  ams_id: number;
  slot_id: number;
  nozzle_id: number | null;
  has_spool: boolean;
  spool: SpoolReading | null;
}

export interface ParsedAmsUnit {
  id: number;
  nozzle_id: number | null;
  slots: ParsedSlot[];
}
