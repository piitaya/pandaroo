export type {
  Printer,
  PrinterInput,
  PrinterPatch,
  Config,
  MatchType,
  Spool,
  SyncState,
  SyncStatus,
  AmsMatchedSlot,
  AmsUnitView,
  PrinterErrorCode,
  PrinterStateView,
} from "@bambu-spoolman-sync/shared";


import type {
  Config,
  Printer,
  PrinterInput,
  PrinterPatch,
  Spool,
  AppState,
  SyncResult,
} from "@bambu-spoolman-sync/shared";

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
      u.slots.map((s) => s.slot.spool?.tag_id).filter((tag_id): tag_id is string => !!tag_id)
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
  refreshFilamentCatalog: () =>
    req<{ count: number }>("/api/filament-catalog/refresh", { method: "POST" }),
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
  syncAllSpoolman: () =>
    req<SyncResult>("/api/spoolman/sync-all", { method: "POST" }),
  listSpools: () => req<Spool[]>("/api/spools"),
  patchSpool: (tagId: string, data: { remain?: number }) =>
    req<Spool>(`/api/spools/${encodeURIComponent(tagId)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  removeSpool: (tagId: string) =>
    req<{ ok: true }>(`/api/spools/${encodeURIComponent(tagId)}`, {
      method: "DELETE",
    }),
};
