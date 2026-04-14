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
  IconExternalLink,
  IconPencil,
  IconRefresh
} from "@tabler/icons-react";
import { useState } from "react";
import { AdjustRemainModal } from "./AdjustRemainModal";
import { useTranslation } from "react-i18next";
import { useMatchStatus } from "./matchStatus";
import { CopyableMono } from "./CopyableMono";
import { Plain, Row, SectionHeader } from "./DetailTable";
import { spoolFillColor } from "./spoolFillColor";
import { SyncDot } from "./SyncDot";
import { formatAmsLocation } from "./formatAmsLocation";
import {
  useConfig,
  useSpoolmanBaseUrl,
  useSpoolLocation,
  useSyncSpoolman
} from "../hooks";
import type { Spool } from "../api";

export function SpoolDetailContent({ spool }: { spool: Spool }) {
  const { t } = useTranslation();
  const matchStatus = useMatchStatus();
  const { data: spoolmanBaseUrl } = useSpoolmanBaseUrl();
  const spoolmanUrl = spoolmanBaseUrl?.replace(/\/+$/, "") ?? null;
  const { data: configData } = useConfig();
  const syncSpoolman = useSyncSpoolman();
  const spoolmanConfigured = Boolean(configData?.spoolman?.url);
  const autoSync = Boolean(configData?.spoolman?.auto_sync);
  const canManualSync =
    spool.match_type === "mapped" && spoolmanConfigured && !autoSync;
  const hasTemp = spool.temp_min != null || spool.temp_max != null;
  const status = matchStatus[spool.match_type];
  const location = useSpoolLocation(spool.tag_id);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const swatches =
    spool.color_hexes && spool.color_hexes.length > 0
      ? spool.color_hexes
      : spool.color_hex
        ? [spool.color_hex]
        : [];
        
  const multiColor = swatches.length > 1;
  const totalWeight = spool.weight != null && Number.isFinite(spool.weight) && spool.weight > 0 ? spool.weight : null;
  const hasRemain = spool.remain != null && spool.remain >= 0;
  const remainWeight = hasRemain && totalWeight ? Math.round(totalWeight * spool.remain! / 100) : null;

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
          {swatches.length > 0 && (
            <>
              <Row
                label={t(multiColor ? "slot.fields.colors" : "slot.fields.color")}
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
                label={t(multiColor ? "slot.fields.colors_hex" : "slot.fields.color_hex")}
                value={<CopyableMono value={swatches.join(", ")} />}
              />
            </>
          )}
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
          {totalWeight != null && (
            <Row
              label={t("slot.fields.total_weight")}
              value={<Plain>{totalWeight} g</Plain>}
            />
          )}
          <Row
            label={t("slot.fields.remaining")}
            value={
              <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                {hasRemain ? (
                  <>
                    <Progress value={spool.remain!} size="sm" style={{ width: 60, flexShrink: 0 }} color={spoolFillColor(spool.remain!)} />
                    <Text size="sm" style={{ whiteSpace: "nowrap", flex: 1 }}>
                      {remainWeight != null ? `${remainWeight} g (${spool.remain}%)` : `${spool.remain}%`}
                    </Text>
                  </>
                ) : (
                  <Text size="sm" c="dimmed" style={{ flex: 1 }}>—</Text>
                )}
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  onClick={() => setAdjustOpen(true)}
                >
                  <IconPencil size={14} />
                </ActionIcon>
                </Group>
              }
            />
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
                  <SyncDot sync={spool.sync} tooltip={null} />
                  <Text
                    size="sm"
                    truncate
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    {t(`slot.sync_status.${spool.sync.status}`)}
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

          <SectionHeader label={t("slot.sections.history")} />
          {location && (
            <Row
              label={t("slot.fields.current_location")}
              value={<Plain>{formatAmsLocation(location, t)}</Plain>}
            />
          )}
          <Row
            label={t("slot.fields.first_seen")}
            value={<Plain>{new Date(spool.first_seen).toLocaleString()}</Plain>}
          />
          {spool.last_used && (
            <Row
              label={t("slot.fields.last_used")}
              value={<Plain>{new Date(spool.last_used).toLocaleString()}</Plain>}
            />
          )}
          <Row
            label={t("slot.fields.last_updated")}
            value={<Plain>{new Date(spool.last_updated).toLocaleString()}</Plain>}
          />
        </Table.Tbody>
      </Table>

      <AdjustRemainModal
        key={spool.tag_id}
        spool={spool}
        opened={adjustOpen}
        onClose={() => setAdjustOpen(false)}
      />
    </Stack>
  );
}
