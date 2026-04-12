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
  type PrinterPatch
} from "./api";

const CONFIG_KEY = ["config"] as const;
const STATE_KEY = ["state"] as const;
const SPOOLS_KEY = ["spools"] as const;

export const useConfig = () =>
  useQuery({ queryKey: CONFIG_KEY, queryFn: api.getConfig });

export const useAppState = () =>
  useQuery({
    queryKey: STATE_KEY,
    queryFn: api.getState,
    refetchInterval: 3000
  });

export const useSpools = () =>
  useQuery({
    queryKey: SPOOLS_KEY,
    queryFn: api.listSpools,
  });

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
    invalidate: [CONFIG_KEY, STATE_KEY],
    onError: usePrinterConflictHandler(),
  });
};

export const useUpdatePrinter = () => {
  const { t } = useTranslation();
  return useMutationWithToast({
    mutationFn: ({ serial, patch }: { serial: string; patch: PrinterPatch }) =>
      api.updatePrinter(serial, patch),
    successMessage: t("printers.notifications.updated"),
    invalidate: [CONFIG_KEY, STATE_KEY],
    onError: usePrinterConflictHandler(),
  });
};

export const useRemovePrinter = () => {
  const { t } = useTranslation();
  return useMutationWithToast({
    mutationFn: (serial: string) => api.removePrinter(serial),
    successMessage: t("printers.notifications.removed"),
    invalidate: [CONFIG_KEY, STATE_KEY],
  });
};

export const usePutConfig = () => {
  const { t } = useTranslation();
  return useMutationWithToast({
    mutationFn: (config: Config) => api.putConfig(config),
    successMessage: t("settings.saved"),
    invalidate: [CONFIG_KEY, STATE_KEY],
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
      qc.invalidateQueries({ queryKey: STATE_KEY });
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
    mutationFn: () => api.refreshMapping(),
    onSuccess: ({ count }) => {
      qc.invalidateQueries({ queryKey: STATE_KEY });
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
  const url = configData?.config.spoolman?.url;
  return useQuery({
    queryKey: ["spoolman-base-url", url ?? ""],
    queryFn: async () => {
      const { base_url } = await api.testSpoolman();
      return base_url;
    },
    enabled: Boolean(url),
    staleTime: Infinity,
    retry: false
  });
};

export const useTestSpoolman = () => {
  const { t } = useTranslation();
  const toast = useToasts();
  return useMutation({
    mutationFn: () => api.testSpoolman(),
    onSuccess: ({ info }) => {
      toast.success(
        t("sync.connection_card.test_ok", { version: info.version ?? "?" })
      );
    },
    onError: toast.error
  });
};

function useSyncResultHandlers() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const toast = useToasts();
  return {
    onSuccess: (result: Awaited<ReturnType<typeof api.syncSpoolman>>) => {
      qc.invalidateQueries({ queryKey: STATE_KEY });
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
