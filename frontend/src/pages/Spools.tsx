import {
  ActionIcon,
  Alert,
  Button,
  ColorSwatch,
  Group,
  Loader,
  Progress,
  Stack,
  Text,
  Title,
  Tooltip
} from "@mantine/core";
import { IconCircleFilled, IconRefresh, IconTrash } from "@tabler/icons-react";
import { DataTable, type DataTableSortStatus } from "mantine-datatable";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Spool, SyncStatus } from "../api";
import { useConfig, useRemoveSpool, useSpools, useSyncAllSpoolman } from "../hooks";
import { useMatchStatus } from "../components/matchStatus";
import { spoolFillColor } from "../components/spoolFillColor";
import { syncStatusColor } from "../components/syncStatusColor";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmptyStateCard } from "../components/EmptyStateCard";

function formatDate(value: string): string {
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  return new Date(normalized).toLocaleString();
}

const syncSortRank: Record<SyncStatus, number> = {
  error: 0,
  stale: 1,
  never: 2,
  synced: 3,
};
const UNMATCHED_SORT_RANK = 4;

function syncSortValue(spool: Spool): number {
  return spool.match_type === "matched"
    ? syncSortRank[spool.sync.status]
    : UNMATCHED_SORT_RANK;
}

function sortData(data: Spool[], { columnAccessor, direction }: DataTableSortStatus<Spool>): Spool[] {
  const sorted = [...data].sort((a, b) => {
    if (columnAccessor === "sync_status") {
      return syncSortValue(a) - syncSortValue(b);
    }
    const aVal = a[columnAccessor as keyof Spool];
    const bVal = b[columnAccessor as keyof Spool];
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (typeof aVal === "number" && typeof bVal === "number") return aVal - bVal;
    return String(aVal).localeCompare(String(bVal));
  });
  return direction === "desc" ? sorted.reverse() : sorted;
}

export default function SpoolsPage() {
  const { data: spools, isLoading, isError, error } = useSpools();
  const { data: configData } = useConfig();
  const syncAllSpoolman = useSyncAllSpoolman();
  const removeSpool = useRemoveSpool();
  const matchStatus = useMatchStatus();
  const { t } = useTranslation();
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Spool>>({
    columnAccessor: "last_updated",
    direction: "desc",
  });
  const [toRemove, setToRemove] = useState<Spool | null>(null);
  const spoolmanConfigured = Boolean(configData?.config.spoolman?.url);

  const sorted = useMemo(
    () => (spools ? sortData(spools, sortStatus) : []),
    [spools, sortStatus],
  );

  if (isLoading) return <Loader />;
  if (isError) {
    return (
      <Alert color="red" title={t("spools.failed_to_load")}>
        {error instanceof Error ? error.message : String(error)}
      </Alert>
    );
  }

  return (
    <Stack gap="xl">
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Title order={2}>{t("spools.title")}</Title>
        {spoolmanConfigured && spools && spools.length > 0 && (
          <Button
            leftSection={<IconRefresh size={16} />}
            variant="default"
            loading={syncAllSpoolman.isPending}
            onClick={() => syncAllSpoolman.mutate()}
          >
            {t("spools.sync_all")}
          </Button>
        )}
      </Group>

      {(!spools || spools.length === 0) ? (
        <EmptyStateCard description={t("spools.empty")} />
      ) : (
        <DataTable
          withTableBorder
          highlightOnHover
          records={sorted}
          idAccessor="tag_id"
          sortStatus={sortStatus}
          onSortStatusChange={setSortStatus}
          columns={[
            {
              accessor: "color_hex",
              title: t("slot.fields.color"),
              sortable: false,
              render: (spool) =>
                spool.color_hex ? (
                  <ColorSwatch color={`#${spool.color_hex}`} size={24} />
                ) : (
                  <Text c="dimmed" size="sm">—</Text>
                ),
            },
            {
              accessor: "color_name",
              title: t("slot.fields.color_name"),
              sortable: true,
              render: (spool) => (
                <Text size="sm" fw={500}>
                  {spool.color_name ?? "—"}
                </Text>
              ),
            },
            {
              accessor: "product",
              title: t("slot.fields.bambu_filament"),
              sortable: true,
              render: (spool) => (
                <Text size="sm">
                  {spool.product ?? "—"}
                </Text>
              ),
            },
            {
              accessor: "material",
              title: t("slot.fields.material"),
              sortable: true,
            },
            {
              accessor: "remain",
              title: t("slot.fields.remaining"),
              sortable: true,
              width: 160,
              render: (spool) =>
                spool.remain != null ? (
                  <Group gap="xs" wrap="nowrap">
                    <Progress
                      value={spool.remain}
                      size="sm"
                      style={{ flex: 1 }}
                      color={spoolFillColor(spool.remain)}
                    />
                    <Text size="xs" c="dimmed" w={36} ta="right">
                      {spool.remain}%
                    </Text>
                  </Group>
                ) : (
                  <Text c="dimmed" size="sm">—</Text>
                ),
            },
            {
              accessor: "last_updated",
              title: t("spools.last_updated"),
              sortable: true,
              render: (spool) => (
                <Text size="xs" c="dimmed">
                  {formatDate(spool.last_updated)}
                </Text>
              ),
            },
            {
              accessor: "sync_status",
              title: t("spools.sync_status"),
              sortable: true,
              width: 90,
              textAlign: "center",
              render: (spool) => {
                if (spool.match_type !== "matched") {
                  return (
                    <Text
                      c="dimmed"
                      size="sm"
                      title={matchStatus[spool.match_type].description}
                    >
                      —
                    </Text>
                  );
                }
                const { sync } = spool;
                const tooltip =
                  sync.status === "error"
                    ? t("spools.sync_tooltip.error", {
                        error: sync.error,
                      })
                    : sync.status === "stale"
                      ? t("spools.sync_tooltip.stale")
                      : sync.status === "synced"
                        ? t("spools.sync_tooltip.synced", {
                            at: formatDate(sync.at),
                          })
                        : t("spools.sync_tooltip.never");
                return (
                  <Tooltip label={tooltip} multiline maw={320}>
                    <IconCircleFilled
                      size={12}
                      style={{ color: syncStatusColor(sync.status) }}
                    />
                  </Tooltip>
                );
              },
            },
            {
              accessor: "actions",
              title: "",
              width: 50,
              textAlign: "center",
              render: (spool) => (
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size="sm"
                  onClick={() => setToRemove(spool)}
                  aria-label={t("common.remove")}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              ),
            },
          ]}
        />
      )}

      <ConfirmModal
        opened={toRemove !== null}
        onClose={() => setToRemove(null)}
        onConfirm={() => {
          if (!toRemove) return;
          removeSpool.mutate(toRemove.tag_id, {
            onSettled: () => setToRemove(null),
          });
        }}
        title={t("spools.remove_confirm_title")}
        body={t("spools.remove_confirm_body", {
          name: toRemove?.color_name ?? toRemove?.tag_id,
        })}
        loading={removeSpool.isPending}
      />
    </Stack>
  );
}
