// ---------------------------------------------------------------------------
// Spool reading — raw attributes from MQTT or NFC scan
// ---------------------------------------------------------------------------

export interface SpoolReading {
  tag_id: string | null;
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

// ---------------------------------------------------------------------------
// Filament matching
// ---------------------------------------------------------------------------

export type MatchType =
  | "mapped"
  | "unmapped"
  | "unknown_variant"
  | "third_party"
  | "unidentified"
  | "empty";

export interface CatalogEntry {
  id: string;
  code?: string;
  material?: string;
  color_name?: string;
  color_hex?: string;
  /** Spoolman external filament ID (field name matches community DB format) */
  spoolman_id?: string | null;
}

// ---------------------------------------------------------------------------
// Sync state — one discriminated union used everywhere
// ---------------------------------------------------------------------------

export type SyncState =
  | { status: "never" }
  | { status: "synced"; spoolman_spool_id: number; at: string }
  | { status: "stale"; spoolman_spool_id: number; at: string }
  | { status: "error"; error: string };

export type SyncStatus = SyncState["status"];

// ---------------------------------------------------------------------------
// AMS location — where a spool is physically loaded
// ---------------------------------------------------------------------------

export interface AmsLocation {
  printer_serial: string;
  printer_name: string;
  ams_id: number;
  slot_id: number;
}

// ---------------------------------------------------------------------------
// Spool — the real business object (persisted + enriched)
// ---------------------------------------------------------------------------

export interface Spool {
  tag_id: string;
  variant_id: string | null;
  match_type: MatchType;
  material: string | null;
  product: string | null;
  color_hex: string | null;
  color_hexes: string[] | null;
  color_name: string | null;
  weight: number | null;
  remain: number | null;
  temp_min: number | null;
  temp_max: number | null;
  last_used: string | null;
  first_seen: string;
  last_updated: string;
  sync: SyncState;
}

// ---------------------------------------------------------------------------
// Sync results
// ---------------------------------------------------------------------------

export interface SpoolSyncResult {
  tag_id: string;
  spoolman_spool_id: number;
  created_filament: boolean;
  created_spool: boolean;
}

export interface SyncResult {
  synced: SpoolSyncResult[];
  skipped: Array<{ tag_id: string; reason: string }>;
  errors: Array<{ tag_id: string; error: string }>;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface PrinterConfig {
  name: string;
  host: string;
  serial: string;
  access_code: string;
  enabled: boolean;
}

export type PrinterInput = PrinterConfig;
export type PrinterPatch = Partial<PrinterConfig>;

export interface Config {
  printers: PrinterConfig[];
  filament_catalog: {
    refresh_interval_hours: number;
  };
  spoolman: {
    url?: string;
    auto_sync: boolean;
    archive_on_empty: boolean;
  };
}

// ---------------------------------------------------------------------------
// Printer connection status
// ---------------------------------------------------------------------------

export type PrinterErrorCode =
  | "unauthorized"
  | "no_response"
  | "unreachable"
  | "other";

export interface PrinterStatus {
  lastError: string | null;
  errorCode: PrinterErrorCode | null;
}

// ---------------------------------------------------------------------------
// AMS slot — a physical slot in the AMS (API response shape)
// ---------------------------------------------------------------------------

export interface AmsSlot {
  ams_id: number;
  slot_id: number;
  nozzle_id: number | null;
  has_spool: boolean;
  reading: SpoolReading | null;
  match_type: MatchType;
  color_name: string | null;
}

// ---------------------------------------------------------------------------
// AMS unit — a physical AMS module
// ---------------------------------------------------------------------------

export interface AmsUnit {
  id: number;
  nozzle_id: number | null;
  slots: AmsSlot[];
}

// ---------------------------------------------------------------------------
// Printer — live printer with AMS data (API response shape)
// ---------------------------------------------------------------------------

export interface Printer {
  serial: string;
  name: string;
  enabled: boolean;
  status: PrinterStatus;
  ams_units: AmsUnit[];
}
