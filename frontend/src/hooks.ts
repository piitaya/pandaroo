import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import {
  api,
  ApiError,
  type Config,
  type PrinterConfig,
  type PrinterPatch,
  type Printer,
  type Spool,
  type AmsLocation,
} from "./api";
import type { SpoolReading } from "@pandaroo/shared";

const SPOOL_HISTORY_ROOT = ["spool-history"] as const;

const queryKeys = {
  config: ["config"] as const,
  printers: ["printers"] as const,
  spools: ["spools"] as const,
  filamentCatalog: ["filament-catalog"] as const,
  filamentCatalogEntries: ["filament-catalog", "entries"] as const,
  spoolHistory: {
    all: SPOOL_HISTORY_ROOT,
    byTag: (tagId: string) => [...SPOOL_HISTORY_ROOT, tagId] as const,
  },
};

// Fixed anchor: ask the backend for every event ever recorded for this tag.
// Keeps the query key stable and avoids first_seen/millisecond-precision
// mismatches where the first event could slip under `gte`.
const HISTORY_FROM_ANCHOR = "1970-01-01T00:00:00.000Z";

export function useEventStream() {
  const qc = useQueryClient();
  useEffect(() => {
    const source = new EventSource("/api/events");
    // On (re)connect, re-sync the live-data queries to cover anything missed
    // while the stream was down. Scoped to avoid nuking unrelated caches.
    source.addEventListener("connected", () => {
      qc.invalidateQueries({ queryKey: queryKeys.printers });
      qc.invalidateQueries({ queryKey: queryKeys.spools });
      qc.invalidateQueries({ queryKey: queryKeys.spoolHistory.all });
      qc.invalidateQueries({ queryKey: queryKeys.config });
    });
    source.addEventListener("printers-changed", () => {
      qc.invalidateQueries({ queryKey: queryKeys.printers });
    });
    source.addEventListener("spools-changed", (e) => {
      qc.invalidateQueries({ queryKey: queryKeys.spools });
      try {
        const { tag_id } = JSON.parse((e as MessageEvent).data);
        if (tag_id) {
          qc.invalidateQueries({ queryKey: queryKeys.spoolHistory.byTag(tag_id) });
        }
      } catch {}
    });
    source.addEventListener("config-changed", () => {
      qc.invalidateQueries({ queryKey: queryKeys.config });
      qc.invalidateQueries({ queryKey: queryKeys.printers });
    });
    return () => source.close();
  }, [qc]);
}

export const useConfig = () =>
  useQuery({ queryKey: queryKeys.config, queryFn: api.getConfig });

export const usePrinters = () =>
  useQuery({
    queryKey: queryKeys.printers,
    queryFn: api.getPrinters,
  });

export const useSpools = () =>
  useQuery({
    queryKey: queryKeys.spools,
    queryFn: api.listSpools,
  });

export const useSpoolHistory = (tagId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.spoolHistory.byTag(tagId ?? ""),
    queryFn: () => api.getSpoolHistory(tagId!, { from: HISTORY_FROM_ANCHOR }),
    enabled: Boolean(tagId),
    placeholderData: (prev) => prev,
  });

export const useFilamentCatalog = () =>
  useQuery({
    queryKey: queryKeys.filamentCatalog,
    queryFn: api.getFilamentCatalog,
  });

export const useFilamentCatalogEntries = () =>
  useQuery({
    queryKey: queryKeys.filamentCatalogEntries,
    queryFn: api.listFilamentCatalog,
  });

// Share derived Maps across callers — keyed by array identity, which React
// Query keeps stable across refetches via structural sharing.
const EMPTY_SPOOLS: readonly Spool[] = [];
const EMPTY_PRINTERS: readonly Printer[] = [];

interface AmsSlotInfo {
  location: AmsLocation;
  reading: SpoolReading;
}

const spoolMapCache = new WeakMap<readonly Spool[], Map<string, Spool>>();
const slotInfoCache = new WeakMap<readonly Printer[], Map<string, AmsSlotInfo>>();
const loadedTagsCache = new WeakMap<readonly Printer[], Set<string>>();

function buildSpoolMap(spools: readonly Spool[]): Map<string, Spool> {
  let map = spoolMapCache.get(spools);
  if (!map) {
    map = new Map(spools.map((s) => [s.tag_id, s]));
    spoolMapCache.set(spools, map);
  }
  return map;
}

function buildSlotInfoMap(printers: readonly Printer[]): Map<string, AmsSlotInfo> {
  let map = slotInfoCache.get(printers);
  if (map) return map;
  map = new Map();
  for (const printer of printers) {
    for (const unit of printer.ams_units) {
      for (const slot of unit.slots) {
        const reading = slot.reading;
        if (!reading?.tag_id) continue;
        map.set(reading.tag_id, {
          location: {
            printer_serial: printer.serial,
            printer_name: printer.name,
            ams_id: unit.id,
            slot_id: slot.slot_id,
          },
          reading,
        });
      }
    }
  }
  slotInfoCache.set(printers, map);
  return map;
}

export function useSpoolMap(): Map<string, Spool> {
  const { data: spools } = useSpools();
  return buildSpoolMap(spools ?? EMPTY_SPOOLS);
}

export function useSpoolLocation(tagId: string): AmsLocation | null {
  const { data: printers } = usePrinters();
  return buildSlotInfoMap(printers ?? EMPTY_PRINTERS).get(tagId)?.location ?? null;
}

export function useLoadedTagIds(): ReadonlySet<string> {
  const { data: printers } = usePrinters();
  const key = printers ?? EMPTY_PRINTERS;
  let set = loadedTagsCache.get(key);
  if (!set) {
    set = new Set();
    for (const printer of key) {
      for (const unit of printer.ams_units) {
        for (const slot of unit.slots) {
          const tag = slot.reading?.tag_id;
          if (tag) set.add(tag);
        }
      }
    }
    loadedTagsCache.set(key, set);
  }
  return set;
}

// True when the tag's AMS slot reports a remain value (not AMS Lite).
export function useSpoolReportsRemain(tagId: string): boolean {
  const { data: printers } = usePrinters();
  return buildSlotInfoMap(printers ?? EMPTY_PRINTERS).get(tagId)?.reading.remain != null;
}

export function useSlotSpool(tagId: string | null | undefined): Spool | undefined {
  const spoolMap = useSpoolMap();
  return tagId ? spoolMap.get(tagId) : undefined;
}

// ---------------------------------------------------------------------------
// Toast helpers
// ---------------------------------------------------------------------------

function useToasts() {
  const { t } = useTranslation();
  return {
    success: (message: string) =>
      notifications.show({ color: "green", message }),
    error: (err: unknown) =>
      notifications.show({
        color: "red",
        title: t("errors.generic"),
        message: err instanceof Error ? err.message : String(err)
      })
  };
}

// ---------------------------------------------------------------------------
// Mutation factory — eliminates toast/invalidation boilerplate
// ---------------------------------------------------------------------------

function useMutationWithToast<TData, TVariables>(opts: {
  mutationFn: (vars: TVariables) => Promise<TData>;
  successMessage: string;
  invalidate?: readonly QueryKey[];
  onError?: (err: unknown) => void;
}) {
  const qc = useQueryClient();
  const toast = useToasts();
  return useMutation({
    mutationFn: opts.mutationFn,
    onSuccess: () => {
      for (const key of opts.invalidate ?? []) {
        qc.invalidateQueries({ queryKey: key });
      }
      toast.success(opts.successMessage);
    },
    onError: opts.onError ?? toast.error,
  });
}

// ---------------------------------------------------------------------------
// Printer mutations
// ---------------------------------------------------------------------------

function usePrinterConflictHandler() {
  const { t } = useTranslation();
  const toast = useToasts();
  return (err: unknown) => {
    if (err instanceof ApiError && err.status === 409) {
      toast.error(new Error(t("printers.notifications.duplicate_serial")));
      return;
    }
    toast.error(err);
  };
}

export const useCreatePrinter = () => {
  const { t } = useTranslation();
  return useMutationWithToast({
    mutationFn: (input: PrinterConfig) => api.createPrinter(input),
    successMessage: t("printers.notifications.added"),
    invalidate: [queryKeys.config, queryKeys.printers],
    onError: usePrinterConflictHandler(),
  });
};

export const useUpdatePrinter = () => {
  const { t } = useTranslation();
  return useMutationWithToast({
    mutationFn: ({ serial, patch }: { serial: string; patch: PrinterPatch }) =>
      api.updatePrinter(serial, patch),
    successMessage: t("printers.notifications.updated"),
    invalidate: [queryKeys.config, queryKeys.printers],
    onError: usePrinterConflictHandler(),
  });
};

export const useRemovePrinter = () => {
  const { t } = useTranslation();
  return useMutationWithToast({
    mutationFn: (serial: string) => api.removePrinter(serial),
    successMessage: t("printers.notifications.removed"),
    invalidate: [queryKeys.config, queryKeys.printers],
  });
};

export const usePutConfig = () => {
  const { t } = useTranslation();
  return useMutationWithToast({
    mutationFn: (config: Config) => api.putConfig(config),
    successMessage: t("settings.saved"),
    invalidate: [queryKeys.config, queryKeys.printers],
  });
};

export const usePatchSpool = () => {
  const { t } = useTranslation();
  return useMutationWithToast({
    mutationFn: ({ tagId, data }: { tagId: string; data: { remain?: number } }) =>
      api.patchSpool(tagId, data),
    successMessage: t("spools.notifications.updated"),
    invalidate: [queryKeys.spools, queryKeys.spoolHistory.all],
  });
};

export const useRemoveSpool = () => {
  const { t } = useTranslation();
  return useMutationWithToast({
    mutationFn: (tagId: string) => api.removeSpool(tagId),
    successMessage: t("spools.notifications.removed"),
    invalidate: [queryKeys.spools],
  });
};

export const usePatchHistoryEvent = () => {
  const { t } = useTranslation();
  return useMutationWithToast({
    mutationFn: ({
      tagId,
      eventId,
      data,
    }: {
      tagId: string;
      eventId: number;
      data: { remain: number | null };
    }) => api.patchHistoryEvent(tagId, eventId, data),
    successMessage: t("spool_detail.usage.manual.updated"),
    invalidate: [queryKeys.spoolHistory.all],
  });
};

export const useDeleteHistoryEvent = () => {
  const { t } = useTranslation();
  return useMutationWithToast({
    mutationFn: ({ tagId, eventId }: { tagId: string; eventId: number }) =>
      api.deleteHistoryEvent(tagId, eventId),
    successMessage: t("spool_detail.usage.manual.deleted"),
    invalidate: [queryKeys.spoolHistory.all],
  });
};

// ---------------------------------------------------------------------------
// Reorder — silent (no success toast, selective invalidation)
// ---------------------------------------------------------------------------

export const useReorderPrinters = () => {
  const qc = useQueryClient();
  const toast = useToasts();
  return useMutation({
    mutationFn: (config: Config) => api.putConfig(config),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.printers });
    },
    onError: (err) => {
      qc.invalidateQueries({ queryKey: queryKeys.config });
      toast.error(err);
    }
  });
};

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

export const useRefreshMapping = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToasts();
  return useMutation({
    mutationFn: () => api.refreshFilamentCatalog(),
    onSuccess: ({ count }) => {
      qc.invalidateQueries({ queryKey: queryKeys.printers });
      qc.invalidateQueries({ queryKey: queryKeys.filamentCatalog });
      qc.invalidateQueries({ queryKey: queryKeys.filamentCatalogEntries });
      toast.success(t("settings.mapping_card.refreshed", { count }));
    },
    onError: toast.error
  });
};

