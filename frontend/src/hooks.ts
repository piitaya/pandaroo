import {
  useMutation,
  useQuery,
  useQueryClient
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

const invalidateAll = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: CONFIG_KEY });
  qc.invalidateQueries({ queryKey: STATE_KEY });
};

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

export const useCreatePrinter = () => {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const toast = useToasts();
  return useMutation({
    mutationFn: (input: PrinterInput) => api.createPrinter(input),
    onSuccess: () => {
      invalidateAll(qc);
      toast.success(t("printers.notifications.added"));
    },
    onError: (err) => {
      // Friendly message for the "serial already exists" case.
      if (err instanceof ApiError && err.status === 409) {
        toast.error(new Error(t("printers.notifications.duplicate_serial")));
        return;
      }
      toast.error(err);
    }
  });
};

export const useUpdatePrinter = () => {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const toast = useToasts();
  return useMutation({
    mutationFn: ({
      serial,
      patch
    }: {
      serial: string;
      patch: PrinterPatch;
    }) => api.updatePrinter(serial, patch),
    onSuccess: () => {
      invalidateAll(qc);
      toast.success(t("printers.notifications.updated"));
    },
    onError: (err) => {
      // Friendly message when a serial rename collides with an
      // existing printer.
      if (err instanceof ApiError && err.status === 409) {
        toast.error(new Error(t("printers.notifications.duplicate_serial")));
        return;
      }
      toast.error(err);
    }
  });
};

export const useRemovePrinter = () => {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const toast = useToasts();
  return useMutation({
    mutationFn: (serial: string) => api.removePrinter(serial),
    onSuccess: () => {
      invalidateAll(qc);
      toast.success(t("printers.notifications.removed"));
    },
    onError: toast.error
  });
};

export const usePutConfig = () => {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const toast = useToasts();
  return useMutation({
    mutationFn: (config: Config) => api.putConfig(config),
    onSuccess: () => {
      invalidateAll(qc);
      toast.success(t("settings.saved"));
    },
    onError: toast.error
  });
};

/**
 * Silent reorder mutation for the printer list. The visual order is
 * owned locally by the Printers page (so dnd-kit's settle animation
 * runs against a stable source of truth), this hook just pushes the
 * new order to the server and re-syncs the state query. On success
 * we deliberately skip invalidating the config query — our local
 * state already matches and a refetch would cause a visual jump
 * mid-animation. On error we invalidate to let the component pull
 * the real server order back.
 */
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

export const useRefreshMapping = () => {
  const qc = useQueryClient();
  const { t } = useTranslation();
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

// Reads Spoolman's own `base_url` setting (used for building links
// to spools). Cached for the lifetime of the session; refetched when
// the saved Spoolman URL changes.
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
        t("sync.connection_card.test_ok", {
          version: info.version ?? "?"
        })
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
