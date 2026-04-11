export interface Printer {
  name: string;
  host: string;
  serial: string;
  access_code: string;
  enabled: boolean;
}

// Creation accepts the full printer. Updates may include a new
// serial — the URL still identifies the printer as it currently
// is; the backend reconciles the change by tearing down and
// reconnecting the MQTT client with the new topic prefix.
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

export interface LocalSpool {
  tag_id: string;
  variant_id: string | null;
  material: string | null;
  product: string | null;
  color_hex: string | null;
  color_name: string | null;
  weight: number | null;
  remain: number | null;
  last_used: string | null;
  first_seen: string;
  last_updated: string;
}

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

export interface Spool {
  uid: string | null;
  variant_id: string | null;
  material: string | null;
  product: string | null;
  color_hex: string | null;
  color_hexes: string[] | null;
  weight: string | null;
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

export type MatchType =
  | "matched"
  | "known_unmapped"
  | "unknown_variant"
  | "third_party"
  | "unknown_spool"
  | "empty";

export interface FilamentEntry {
  id: string;
  material?: string;
  color_name?: string;
  color_hex?: string;
  spoolman_id?: string | null;
}

export type SlotSyncView =
  | { status: "never" }
  | { status: "synced"; spool_id: number; at: string }
  | { status: "stale"; spool_id: number; at: string }
  | { status: "error"; error: string; at: string };

export interface AmsMatchedSlot {
  slot: AmsSlot;
  type: MatchType;
  entry?: FilamentEntry;
  sync: SlotSyncView;
}

export type PrinterErrorCode =
  | "unauthorized"
  | "no_response"
  | "unreachable"
  | "other";

export interface AmsUnit {
  id: number;
  nozzle_id: number | null;
  slots: AmsMatchedSlot[];
}

export interface PrinterStateView {
  serial: string;
  name: string;
  enabled: boolean;
  status: {
    lastError: string | null;
    errorCode: PrinterErrorCode | null;
  };
  ams_units: AmsUnit[];
}

export interface AppState {
  printers: PrinterStateView[];
  mapping: {
    count: number;
    fetched_at: string | null;
  };
}

/**
 * Thrown by `req()` on non-2xx responses. Carries the HTTP status
 * so hooks can key i18n messages off specific codes (e.g. 409 for
 * "serial already exists") instead of parsing the human message.
 */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  if (init.body != null && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Backend routes return `{ error: "..." }` on failure; extract
    // the error string if the body is JSON, otherwise fall back to
    // the raw text or the HTTP status line.
    let message = res.statusText || `HTTP ${res.status}`;
    if (text) {
      try {
        const body = JSON.parse(text) as { error?: unknown };
        if (typeof body.error === "string") message = body.error;
      } catch {
        message = text;
      }
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export function collectActiveTagIds(state: AppState): string[] {
  return state.printers.flatMap((p) =>
    p.ams_units.flatMap((u) =>
      u.slots.map((s) => s.slot.spool?.uid).filter((uid): uid is string => !!uid)
    )
  );
}

export const api = {
  getConfig: () => req<{ config: Config }>("/api/config"),
  putConfig: (config: Config) =>
    req<{ config: Config }>("/api/config", {
      method: "PUT",
      body: JSON.stringify(config)
    }),
  createPrinter: (input: PrinterInput) =>
    req<Printer>("/api/printers", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  updatePrinter: (serial: string, patch: PrinterPatch) =>
    req<Printer>(`/api/printers/${encodeURIComponent(serial)}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    }),
  removePrinter: (serial: string) =>
    req<{ ok: true }>(`/api/printers/${encodeURIComponent(serial)}`, {
      method: "DELETE"
    }),
  getState: () => req<AppState>("/api/state"),
  refreshMapping: () =>
    req<{ count: number }>("/api/mapping/refresh", { method: "POST" }),
  testSpoolman: () =>
    req<{
      ok: true;
      info: { version?: string };
      base_url: string | null;
    }>("/api/spoolman/test", {
      method: "POST"
    }),
  syncSpoolman: (tagIds: string[]) =>
    req<SyncResult>("/api/spoolman/sync", {
      method: "POST",
      body: JSON.stringify({ tag_ids: tagIds }),
    }),
  listSpools: () => req<LocalSpool[]>("/api/spools"),
};
