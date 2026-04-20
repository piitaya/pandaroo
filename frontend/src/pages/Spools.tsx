import {
  ActionIcon,
  Alert,
  ColorSwatch,
  Group,
  Loader,
  Menu,
  Progress,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconDots, IconGauge, IconTrash } from "@tabler/icons-react";
import { DataTable, type DataTableSortStatus } from "mantine-datatable";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Spool } from "../api";
import { useRemoveSpool, useSpoolMap, useSpools } from "../hooks";
import { spoolFillColor } from "../components/spoolFillColor";
import { ConfirmModal } from "../components/ConfirmModal";
import { EmptyStateCard } from "../components/EmptyStateCard";
import { AdjustRemainModal } from "../components/AdjustRemainModal";

function formatDate(value: string): string {
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  return new Date(normalized).toLocaleString();
}

function sortData(data: Spool[], { columnAccessor, direction }: DataTableSortStatus<Spool>): Spool[] {
  const sorted = [...data].sort((a, b) => {
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
  const removeSpool = useRemoveSpool();
  const { t } = useTranslation();
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Spool>>({
    columnAccessor: "last_updated",
    direction: "desc",
  });
  const [toRemove, setToRemove] = useState<Spool | null>(null);
  const [toAdjustId, setToAdjustId] = useState<string | null>(null);

  // Allow other pages to deep-link a spool by its tag id via navigation state.
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const state = location.state as { selectTagId?: string } | null;
    if (state?.selectTagId) {
      navigate(`/inventory/${encodeURIComponent(state.selectTagId)}`, {
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spoolsByTagId = useSpoolMap();
  const toAdjust = toAdjustId ? spoolsByTagId.get(toAdjustId) ?? null : null;

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
      <Title order={2}>{t("spools.title")}</Title>

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
          onRowClick={({ record }) => navigate(`/inventory/${encodeURIComponent(record.tag_id)}`)}
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
              accessor: "actions",
              title: "",
              width: 50,
              textAlign: "center",
              render: (spool) => (
                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <IconDots size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      leftSection={<IconGauge size={14} />}
                      onClick={(e) => { e.stopPropagation(); setToAdjustId(spool.tag_id); }}
                    >
                      {t("spools.adjust_remain")}
                    </Menu.Item>
                    <Menu.Item
                      color="red"
                      leftSection={<IconTrash size={14} />}
                      onClick={(e) => { e.stopPropagation(); setToRemove(spool); }}
                    >
                      {t("common.remove")}
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              ),
            },
          ]}
        />
      )}

      {toAdjust && (
        <AdjustRemainModal
          key={toAdjust.tag_id}
          spool={toAdjust}
          opened
          onClose={() => setToAdjustId(null)}
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
