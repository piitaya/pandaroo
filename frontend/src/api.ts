export type {
  Printer,
  PrinterConfig,
  PrinterInput,
  PrinterPatch,
  Config,
  SlotMatchType,
  SpoolMatchType,
  Spool,
  SpoolHistoryEvent,
  SpoolHistoryEventType,
  SpoolHistoryResponse,
  SyncState,
  SyncStatus,
  AmsSlot,
  AmsUnit,
  AmsLocation,
  PrinterErrorCode,
} from "@bambu-spoolman-sync/shared";


import type {
  Config,
  Printer,
  PrinterConfig,
  PrinterInput,
  PrinterPatch,
  Spool,
  SpoolHistoryResponse,
  SyncResult,
} from "@bambu-spoolman-sync/shared";

/**
 * Thrown by `req()` on non-2xx responses. Carries the HTTP status
 * so hooks can key i18n messages off specific codes (e.g. 409 for
 * "serial already exists") instead of parsing the human message.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
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
    // Backend errors are `{ error: "…", code?: "…" }`. Preserve both so callers
    // can key UI off `code` without parsing the message.
    let message = res.statusText || `HTTP ${res.status}`;
    let code: string | undefined;
    if (text) {
      try {
        const body = JSON.parse(text) as { error?: unknown; code?: unknown };
        if (typeof body.error === "string") message = body.error;
        if (typeof body.code === "string") code = body.code;
      } catch {
        message = text;
      }
    }
    throw new ApiError(res.status, message, code);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function collectActiveTagIds(printers: Printer[]): string[] {
  return printers.flatMap((p) =>
    p.ams_units.flatMap((u) =>
      u.slots.map((s) => s.reading?.tag_id).filter((tag_id): tag_id is string => !!tag_id)
    )
  );
}

export const api = {
  getConfig: () => req<Config>("/api/config"),
  putConfig: (config: Config) =>
    req<Config>("/api/config", {
      method: "PUT",
      body: JSON.stringify(config)
    }),
  createPrinter: (input: PrinterInput) =>
    req<PrinterConfig>("/api/printers", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  updatePrinter: (serial: string, patch: PrinterPatch) =>
    req<PrinterConfig>(`/api/printers/${encodeURIComponent(serial)}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    }),
  removePrinter: (serial: string) =>
    req<{ ok: true }>(`/api/printers/${encodeURIComponent(serial)}`, {
      method: "DELETE"
    }),
  getPrinters: () => req<Printer[]>("/api/printer-statuses"),
  getFilamentCatalog: () => req<{ count: number; fetched_at: string | null }>("/api/filament-catalog/status"),
  refreshFilamentCatalog: () =>
    req<{ count: number }>("/api/filament-catalog/refresh", { method: "POST" }),
  getSpoolmanStatus: () =>
    req<{
      ok: true;
      info: { version?: string };
      base_url: string | null;
    }>("/api/spoolman/status"),
  syncSpoolman: (tagIds: string[]) =>
    req<SyncResult>("/api/spoolman/sync", {
      method: "POST",
      body: JSON.stringify({ tag_ids: tagIds }),
    }),
  syncAllSpoolman: () =>
    req<SyncResult>("/api/spoolman/sync-all", { method: "POST" }),
  listSpools: () => req<Spool[]>("/api/spools"),
  getSpool: (tagId: string) =>
    req<Spool>(`/api/spools/${encodeURIComponent(tagId)}`),
  getSpoolHistory: (
    tagId: string,
    params: { from?: string; to?: string; before?: string; limit?: number } = {},
  ) => {
    const search = new URLSearchParams();
    if (params.from) search.set("from", params.from);
    if (params.to) search.set("to", params.to);
    if (params.before) search.set("before", params.before);
    if (params.limit) search.set("limit", String(params.limit));
    const qs = search.toString();
    return req<SpoolHistoryResponse>(
      `/api/spools/${encodeURIComponent(tagId)}/history${qs ? `?${qs}` : ""}`,
    );
  },
  patchSpool: (tagId: string, data: { remain?: number }) =>
    req<Spool>(`/api/spools/${encodeURIComponent(tagId)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  removeSpool: (tagId: string) =>
    req<void>(`/api/spools/${encodeURIComponent(tagId)}`, {
      method: "DELETE",
    }),
  patchHistoryEvent: (tagId: string, eventId: number, data: { remain: number | null }) =>
    req<import("@bambu-spoolman-sync/shared").SpoolHistoryEvent>(
      `/api/spools/${encodeURIComponent(tagId)}/history/${eventId}`,
      { method: "PATCH", body: JSON.stringify(data) },
    ),
  deleteHistoryEvent: (tagId: string, eventId: number) =>
    req<void>(
      `/api/spools/${encodeURIComponent(tagId)}/history/${eventId}`,
      { method: "DELETE" },
    ),
};
