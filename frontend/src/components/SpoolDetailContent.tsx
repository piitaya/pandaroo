import {
  ActionIcon,
  Badge,
  Group,
  Progress,
  Stack,
  Table,
  Text,
  Tooltip
} from "@mantine/core";
import {
  IconCircleFilled,
  IconExternalLink,
  IconPencil,
  IconRefresh
} from "@tabler/icons-react";
import { useState } from "react";
import { AdjustRemainModal } from "./AdjustRemainModal";
import { useTranslation } from "react-i18next";
import { useMatchStatus } from "./matchStatus";
import { syncStatusColor } from "./syncStatusColor";
import { CopyableMono } from "./CopyableMono";
import { spoolFillColor } from "./spoolFillColor";
import { amsLabel } from "./amsLabel";
import {
  useConfig,
  useSpoolmanBaseUrl,
  useSyncSpoolman
} from "../hooks";
import type { Spool } from "../api";

function Row({
  label,
  value
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Table.Tr>
      <Table.Td style={{ verticalAlign: "top" }}>
        <Text size="sm" c="dimmed" truncate>
          {label}
        </Text>
      </Table.Td>
      <Table.Td style={{ minWidth: 0 }}>{value}</Table.Td>
    </Table.Tr>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <Table.Tr>
      <Table.Td
        colSpan={2}
        style={{ paddingTop: 12, paddingBottom: 4, borderBottom: "none" }}
      >
        <Text size="xs" fw={600} tt="uppercase" c="dimmed">
          {label}
        </Text>
      </Table.Td>
    </Table.Tr>
  );
}

function Plain({ children }: { children: React.ReactNode }) {
  return (
    <Text size="sm" truncate>
      {children}
    </Text>
  );
}

export function SpoolDetailContent({ spool }: { spool: Spool }) {
  const { t } = useTranslation();
  const matchStatus = useMatchStatus();
  const { data: spoolmanBaseUrl } = useSpoolmanBaseUrl();
  const spoolmanUrl = spoolmanBaseUrl?.replace(/\/+$/, "") ?? null;
  const { data: configData } = useConfig();
  const syncSpoolman = useSyncSpoolman();
  const spoolmanConfigured = Boolean(configData?.config.spoolman?.url);
  const autoSync = Boolean(configData?.config.spoolman?.auto_sync);
  const canManualSync =
    spool.match_type === "mapped" && spoolmanConfigured && !autoSync;
  const syncDotColor = syncStatusColor(spool.sync.status);
  const hasTemp = spool.temp_min != null || spool.temp_max != null;
  const status = matchStatus[spool.match_type];
  const isPersistedSpool = Boolean(spool.first_seen);
  const [adjustOpen, setAdjustOpen] = useState(false);

  return (
    <Stack gap="md">
      <Group gap="xs">
        <Badge color={status.color} variant="light">
          {status.label}
        </Badge>
      </Group>

      <Table layout="fixed" withRowBorders>
        <colgroup>
          <col style={{ width: "33%" }} />
          <col style={{ width: "67%" }} />
        </colgroup>
        <Table.Tbody>
          <SectionHeader label={t("slot.sections.filament")} />
          {spool.color_name && (
            <Row
              label={t("slot.fields.color_name")}
              value={<Plain>{spool.color_name}</Plain>}
            />
          )}
          {(() => {
            const swatches =
              spool.color_hexes && spool.color_hexes.length > 0
                ? spool.color_hexes
                : spool.color_hex
                  ? [spool.color_hex]
                  : [];
            if (swatches.length === 0) return null;
            const multi = swatches.length > 1;
            return (
              <>
                <Row
                  label={t(multi ? "slot.fields.colors" : "slot.fields.color")}
                  value={
                    <Group gap={6} wrap="wrap">
                      {swatches.map((hex, i) => {
                        const valid = hex && hex !== "00000000";
                        return (
                          <Tooltip
                            key={`${hex}-${i}`}
                            label={`#${hex.slice(0, 6)}`}
                            withArrow
                          >
                            <div
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: 4,
                                border: "1px solid #ddd",
                                background: valid
                                  ? `#${hex.slice(0, 6)}`
                                  : "transparent",
                                flexShrink: 0
                              }}
                            />
                          </Tooltip>
                        );
                      })}
                    </Group>
                  }
                />
                <Row
                  label={t(multi ? "slot.fields.colors_hex" : "slot.fields.color_hex")}
                  value={<CopyableMono value={swatches.join(", ")} />}
                />
              </>
            );
          })()}
          <Row
            label={t("slot.fields.material")}
            value={
              <Plain>
                {spool.product?.trim() ||
                  spool.material?.trim() ||
                  "—"}
              </Plain>
            }
          />

          <SectionHeader label={t("slot.sections.identification")} />
          {spool.variant_id && (
            <Row
              label={t("slot.fields.bambu_filament")}
              value={<CopyableMono value={spool.variant_id} />}
            />
          )}
          {spool.tag_id && (
            <Row
              label={t("slot.fields.spool_uid")}
              value={<CopyableMono value={spool.tag_id} />}
            />
          )}

          <SectionHeader label={t("slot.sections.physical")} />
          {(() => {
            const w = spool.weight ? Number(spool.weight) : NaN;
            if (!Number.isFinite(w) || w <= 0) return null;
            return (
              <Row
                label={t("slot.fields.total_weight")}
                value={<Plain>{w} g</Plain>}
              />
            );
          })()}
          {spool.remain != null && spool.remain >= 0 && (() => {
            const w = spool.weight ? Math.round(spool.weight * spool.remain / 100) : null;
            return (
              <Row
                label={t("slot.fields.remaining")}
                value={
                  <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                    <Progress value={spool.remain} size="sm" style={{ width: 60, flexShrink: 0 }} color={spoolFillColor(spool.remain)} />
                    <Text size="sm" style={{ whiteSpace: "nowrap", flex: 1 }}>
                      {w != null ? `${w} g (${spool.remain}%)` : `${spool.remain}%`}
                    </Text>
                    {isPersistedSpool && (
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        onClick={() => setAdjustOpen(true)}
                      >
                        <IconPencil size={14} />
                      </ActionIcon>
                    )}
                  </Group>
                }
              />
            );
          })()}
          {hasTemp && (
            <Row
              label={t("slot.fields.nozzle_temp")}
              value={
                <Plain>
                  {spool.temp_min ?? "—"} – {spool.temp_max ?? "—"} °C
                </Plain>
              }
            />
          )}

          {spool.match_type === "mapped" && spoolmanConfigured && (
            <SectionHeader label={t("slot.sections.sync")} />
          )}
          {spool.match_type === "mapped" && spoolmanConfigured && (
            <Row
              label={t("slot.fields.sync_status")}
              value={
                <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                  <IconCircleFilled
                    size={10}
                    style={{ color: syncDotColor, flexShrink: 0 }}
                  />
                  <Text
                    size="sm"
                    truncate
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    {spool.sync.status === "synced"
                      ? t("slot.sync_status.synced")
                      : spool.sync.status === "stale"
                        ? t("slot.sync_status.stale")
                        : spool.sync.status === "error"
                          ? t("slot.sync_status.error")
                          : t("slot.sync_status.never")}
                  </Text>
                  {canManualSync && (
                    <Tooltip
                      label={t("slot.sync_aria_label")}
                      withArrow
                      position="left"
                    >
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        loading={syncSpoolman.isPending}
                        onClick={() => {
                          if (spool.tag_id) syncSpoolman.mutate([spool.tag_id]);
                        }}
                        aria-label={t("slot.sync_aria_label")}
                      >
                        <IconRefresh size={14} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              }
            />
          )}
          {spool.match_type === "mapped" &&
            (spool.sync.status === "synced" ||
              spool.sync.status === "stale") && (
              <Row
                label={t("slot.fields.spoolman_spool")}
                value={
                  <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
                    <Text
                      size="sm"
                      truncate
                      style={{ flex: 1, minWidth: 0 }}
                    >
                      #{spool.sync.spoolman_spool_id}
                    </Text>
                    {spoolmanUrl && (
                      <Tooltip
                        label={t("slot.sync_status.open_in_spoolman")}
                        withArrow
                        position="left"
                      >
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="gray"
                          component="a"
                          href={`${spoolmanUrl}/spool/show/${spool.sync.spoolman_spool_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={t("slot.sync_status.open_in_spoolman")}
                        >
                          <IconExternalLink size={14} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                }
              />
            )}
          {spool.match_type === "mapped" && "at" in spool.sync && (
            <Row
              label={t("slot.fields.sync_last")}
              value={<Plain>{new Date(spool.sync.at).toLocaleString()}</Plain>}
            />
          )}
          {spool.match_type === "mapped" && spool.sync.status === "error" && (
            <Row
              label={t("slot.fields.sync_error")}
              value={<Plain>{spool.sync.error}</Plain>}
            />
          )}

          {(spool.last_printer_serial || spool.first_seen) && (
            <SectionHeader label={spool.first_seen ? t("slot.sections.history") : t("slot.sections.source")} />
          )}
          {spool.last_printer_serial && (
            <Row
              label={spool.first_seen ? t("slot.fields.last_location") : t("slot.fields.printer_serial")}
              value={
                <Plain>
                  {configData?.config.printers.find((p) => p.serial === spool.last_printer_serial)?.name ?? spool.last_printer_serial}
                  {spool.last_ams_id != null && ` · ${amsLabel(spool.last_ams_id)}`}
                  {spool.last_slot_id != null && ` · ${t("slot.label", { n: spool.last_slot_id + 1 })}`}
                </Plain>
              }
            />
          )}
          {spool.first_seen && (
            <Row
              label={t("slot.fields.first_seen")}
              value={<Plain>{new Date(spool.first_seen).toLocaleString()}</Plain>}
            />
          )}
          {spool.last_used && (
            <Row
              label={t("slot.fields.last_used")}
              value={<Plain>{new Date(spool.last_used).toLocaleString()}</Plain>}
            />
          )}
          {spool.last_updated && spool.first_seen && (
            <Row
              label={t("slot.fields.last_updated")}
              value={<Plain>{new Date(spool.last_updated).toLocaleString()}</Plain>}
            />
          )}
        </Table.Tbody>
      </Table>

      {isPersistedSpool && (
        <AdjustRemainModal
          key={spool.tag_id}
          spool={spool}
          opened={adjustOpen}
          onClose={() => setAdjustOpen(false)}
        />
      )}
    </Stack>
  );
}
