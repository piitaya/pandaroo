// ---------------------------------------------------------------------------
// Spool data — raw attributes from MQTT or NFC scan
// ---------------------------------------------------------------------------

export interface SpoolData {
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
  spool: SpoolData | null;
}

// ---------------------------------------------------------------------------
// Filament matching
// ---------------------------------------------------------------------------

export type MatchType =
  | "matched"
  | "known_unmapped"
  | "unknown_variant"
  | "third_party"
  | "unknown_spool"
  | "empty";

export interface FilamentEntry {
  id: string;
  code?: string;
  material?: string;
  color_name?: string;
  color_hex?: string;
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
// Spool — the real business object (persisted + enriched)
// ---------------------------------------------------------------------------

export interface Spool {
  tag_id: string;
  variant_id: string | null;
  match_type: MatchType;
  material: string | null;
  product: string | null;
  color_hex: string | null;
  color_name: string | null;
  weight: number | null;
  remain: number | null;
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

export interface Printer {
  name: string;
  host: string;
  serial: string;
  access_code: string;
  enabled: boolean;
}

export type PrinterInput = Printer;
export type PrinterPatch = Partial<Printer>;

export interface Config {
  printers: Printer[];
  mapping: {
    refresh_interval_hours: number;
  };
  spoolman: {
    url?: string;
    auto_sync: boolean;
    archive_on_empty: boolean;
  };
}

// ---------------------------------------------------------------------------
// Printer status
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
// State views (API response shapes)
// ---------------------------------------------------------------------------

export interface AmsMatchedSlot {
  slot: AmsSlot;
  type: MatchType;
  entry?: FilamentEntry;
  sync: SyncState;
}

export interface AmsUnitView {
  id: number;
  nozzle_id: number | null;
  slots: AmsMatchedSlot[];
}

export interface PrinterStateView {
  serial: string;
  name: string;
  enabled: boolean;
  status: PrinterStatus;
  ams_units: AmsUnitView[];
}

export interface AppState {
  printers: PrinterStateView[];
  mapping: {
    count: number;
    fetched_at: string | null;
  };
}
