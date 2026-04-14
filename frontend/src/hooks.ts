import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  api,
  ApiError,
  type Config,
  type PrinterInput,
  type PrinterPatch,
  type Printer,
  type Spool,
  type AmsLocation,
} from "./api";

const CONFIG_KEY = ["config"] as const;
const PRINTERS_KEY = ["printers"] as const;
const SPOOLS_KEY = ["spools"] as const;
const FILAMENT_CATALOG_KEY = ["filament-catalog"] as const;

export const useConfig = () =>
  useQuery({ queryKey: CONFIG_KEY, queryFn: api.getConfig });

// TODO: Replace polling with WebSocket or SSE for real-time updates
export const usePrinters = () =>
  useQuery({
    queryKey: PRINTERS_KEY,
    queryFn: api.getPrinters,
    refetchInterval: 3000,
  });

export const useSpools = () =>
  useQuery({
    queryKey: SPOOLS_KEY,
    queryFn: api.listSpools,
    refetchInterval: 5000,
  });

export const useFilamentCatalog = () =>
  useQuery({
    queryKey: FILAMENT_CATALOG_KEY,
    queryFn: api.getFilamentCatalog,
  });

// Share derived Maps across callers — keyed by array identity, which React
// Query keeps stable across refetches via structural sharing.
const EMPTY_SPOOLS: readonly Spool[] = [];
const EMPTY_PRINTERS: readonly Printer[] = [];
const spoolMapCache = new WeakMap<readonly Spool[], Map<string, Spool>>();
const locationMapCache = new WeakMap<readonly Printer[], Map<string, AmsLocation>>();

function buildSpoolMap(spools: readonly Spool[]): Map<string, Spool> {
  let map = spoolMapCache.get(spools);
  if (!map) {
    map = new Map(spools.map((s) => [s.tag_id, s]));
    spoolMapCache.set(spools, map);
  }
  return map;
}

function buildLocationMap(printers: readonly Printer[]): Map<string, AmsLocation> {
  let map = locationMapCache.get(printers);
  if (map) return map;
  map = new Map();
  for (const printer of printers) {
    for (const unit of printer.ams_units) {
      for (const slot of unit.slots) {
        const tagId = slot.reading?.tag_id;
        if (tagId) {
          map.set(tagId, {
            printer_serial: printer.serial,
            printer_name: printer.name,
            ams_id: unit.id,
            slot_id: slot.slot_id,
          });
        }
      }
    }
  }
  locationMapCache.set(printers, map);
  return map;
}

export function useSpoolMap(): Map<string, Spool> {
  const { data: spools } = useSpools();
  return buildSpoolMap(spools ?? EMPTY_SPOOLS);
}

export function useSpoolLocation(tagId: string): AmsLocation | null {
  const { data: printers } = usePrinters();
  return buildLocationMap(printers ?? EMPTY_PRINTERS).get(tagId) ?? null;
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
    mutationFn: (input: PrinterInput) => api.createPrinter(input),
    successMessage: t("printers.notifications.added"),
    invalidate: [CONFIG_KEY, PRINTERS_KEY],
    onError: usePrinterConflictHandler(),
  });
};

export const useUpdatePrinter = () => {
  const { t } = useTranslation();
  return useMutationWithToast({
    mutationFn: ({ serial, patch }: { serial: string; patch: PrinterPatch }) =>
      api.updatePrinter(serial, patch),
    successMessage: t("printers.notifications.updated"),
    invalidate: [CONFIG_KEY, PRINTERS_KEY],
    onError: usePrinterConflictHandler(),
  });
};

export const useRemovePrinter = () => {
  const { t } = useTranslation();
  return useMutationWithToast({
    mutationFn: (serial: string) => api.removePrinter(serial),
    successMessage: t("printers.notifications.removed"),
    invalidate: [CONFIG_KEY, PRINTERS_KEY],
  });
};

export const usePutConfig = () => {
  const { t } = useTranslation();
  return useMutationWithToast({
    mutationFn: (config: Config) => api.putConfig(config),
    successMessage: t("settings.saved"),
    invalidate: [CONFIG_KEY, PRINTERS_KEY],
  });
};

export const usePatchSpool = () => {
  const { t } = useTranslation();
  return useMutationWithToast({
    mutationFn: ({ tagId, data }: { tagId: string; data: { remain?: number } }) =>
      api.patchSpool(tagId, data),
    successMessage: t("spools.notifications.updated"),
    invalidate: [SPOOLS_KEY],
  });
};

export const useRemoveSpool = () => {
  const { t } = useTranslation();
  return useMutationWithToast({
    mutationFn: (tagId: string) => api.removeSpool(tagId),
    successMessage: t("spools.notifications.removed"),
    invalidate: [SPOOLS_KEY],
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
      qc.invalidateQueries({ queryKey: PRINTERS_KEY });
    },
    onError: (err) => {
      qc.invalidateQueries({ queryKey: CONFIG_KEY });
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
      qc.invalidateQueries({ queryKey: PRINTERS_KEY });
      qc.invalidateQueries({ queryKey: FILAMENT_CATALOG_KEY });
      toast.success(t("settings.mapping_card.refreshed", { count }));
    },
    onError: toast.error
  });
};

// ---------------------------------------------------------------------------
// Spoolman
// ---------------------------------------------------------------------------

export const useSpoolmanBaseUrl = () => {
  const { data: configData } = useConfig();
  const url = configData?.spoolman?.url;
  return useQuery({
    queryKey: ["spoolman-base-url", url ?? ""],
    queryFn: async () => {
      const { base_url } = await api.getSpoolmanStatus();
      return base_url;
    },
    enabled: Boolean(url),
    staleTime: Infinity,
    retry: false
  });
};

function useSyncResultHandlers() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const toast = useToasts();
  return {
    onSuccess: (result: Awaited<ReturnType<typeof api.syncSpoolman>>) => {
      qc.invalidateQueries({ queryKey: PRINTERS_KEY });
      qc.invalidateQueries({ queryKey: SPOOLS_KEY });
      if (result.errors.length > 0) {
        toast.error(
          new Error(
            t("spoolman.sync_all.partial", {
              synced: result.synced.length,
              errors: result.errors.length
            })
          )
        );
        return;
      }
      toast.success(
        t("spoolman.sync_all.done", {
          synced: result.synced.length,
          skipped: result.skipped.length
        })
      );
    },
    onError: toast.error
  };
}

export const useSyncSpoolman = () => {
  const handlers = useSyncResultHandlers();
  return useMutation({
    mutationFn: (tagIds: string[]) => api.syncSpoolman(tagIds),
    ...handlers
  });
};

export const useSyncAllSpoolman = () => {
  const handlers = useSyncResultHandlers();
  return useMutation({
    mutationFn: () => api.syncAllSpoolman(),
    ...handlers
  });
};
