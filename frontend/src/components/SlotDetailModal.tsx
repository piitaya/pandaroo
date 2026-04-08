import {
  ActionIcon,
  Badge,
  CopyButton,
  Drawer,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  Tooltip
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconCheck,
  IconCircleFilled,
  IconCopy,
  IconExternalLink,
  IconRefresh
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { amsLabel } from "./AmsBlock";
import { useMatchStatus } from "./matchStatus";
import {
  useConfig,
  useSpoolmanBaseUrl,
  useSyncSlotSpoolman
} from "../hooks";
import type { MatchedSlot } from "../api";

function Row({
  label,
  value
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Table.Tr>
      <Table.Td style={{ width: 120, verticalAlign: "top" }}>
        <Text size="sm" c="dimmed">
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

function CopyableMono({ value }: { value: string }) {
  const { t } = useTranslation();
  return (
    <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
      <Text ff="monospace" size="sm" truncate style={{ flex: 1, minWidth: 0 }}>
        {value}
      </Text>
      <CopyButton value={value} timeout={1500}>
        {({ copied, copy }) => (
          <Tooltip
            label={copied ? t("common.copied") : t("common.copy")}
            withArrow
            position="left"
          >
            <ActionIcon
              size="sm"
              variant="subtle"
              color={copied ? "teal" : "gray"}
              onClick={copy}
              aria-label={t("common.copy")}
            >
              {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  );
}

export function SlotDetailModal({
  slot,
  opened,
  onClose
}: {
  slot: MatchedSlot;
  opened: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const matchStatus = useMatchStatus();
  const { data: spoolmanBaseUrl } = useSpoolmanBaseUrl();
  const spoolmanUrl = spoolmanBaseUrl?.replace(/\/+$/, "") ?? null;
  const { data: configData } = useConfig();
  const syncSlot = useSyncSlotSpoolman();
  const spoolmanConfigured = Boolean(configData?.config.spoolman?.url);
  const autoSync = Boolean(configData?.config.spoolman?.auto_sync);
  const canManualSync =
    slot.type === "matched" && spoolmanConfigured && !autoSync;
  const syncDotColor =
    slot.sync.status === "synced"
      ? "var(--mantine-color-teal-6)"
      : slot.sync.status === "stale"
        ? "var(--mantine-color-yellow-6)"
        : slot.sync.status === "error"
          ? "var(--mantine-color-red-6)"
          : "var(--mantine-color-gray-5)";
  const s = slot.slot;
  const slotName = t("slot.label", { n: s.slot_id + 1 });
  const title = `${amsLabel(s.ams_id)} · ${slotName}`;
  const hasTemp = s.nozzle_temp_min != null || s.nozzle_temp_max != null;
  const status = matchStatus[slot.type];
  const isMobile = useMediaQuery("(max-width: 48em)") ?? false;

  const Container = isMobile ? Drawer : Modal;
  const containerProps = isMobile
    ? ({ position: "bottom", size: "90%" } as const)
    : ({ size: "md", centered: true } as const);

  return (
    <Container
      opened={opened}
      onClose={onClose}
      title={title}
      {...containerProps}
    >
      <Stack gap="md">
        <Group gap="xs">
          <Badge color={status.color} variant="light">
            {status.label}
          </Badge>
        </Group>

        <Table layout="fixed" withRowBorders>
          <Table.Tbody>
            <SectionHeader label={t("slot.sections.filament")} />
            {slot.entry?.color_name && (
              <Row
                label={t("slot.fields.color_name")}
                value={<Plain>{slot.entry.color_name}</Plain>}
              />
            )}
            {(() => {
              const swatches =
                s.tray_colors && s.tray_colors.length > 0
                  ? s.tray_colors
                  : s.tray_color
                    ? [s.tray_color]
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
                <Plain>{s.tray_sub_brands ?? s.tray_type ?? "—"}</Plain>
              }
            />

            <SectionHeader label={t("slot.sections.identification")} />
            {s.tray_id_name && (
              <Row
                label={t("slot.fields.bambu_filament")}
                value={<CopyableMono value={s.tray_id_name} />}
              />
            )}
            {slot.entry?.spoolman_id && (
              <Row
                label={t("slot.fields.spoolman_filament")}
                value={<CopyableMono value={slot.entry.spoolman_id} />}
              />
            )}
            {s.tray_uuid && (
              <Row
                label={t("slot.fields.spool_uid")}
                value={<CopyableMono value={s.tray_uuid} />}
              />
            )}

            <SectionHeader label={t("slot.sections.physical")} />
            {s.tray_weight && (
              <Row
                label={t("slot.fields.total_weight")}
                value={<Plain>{s.tray_weight} g</Plain>}
              />
            )}
            {s.remain != null && (
              <Row
                label={t("slot.fields.remaining")}
                value={<Plain>{s.remain}%</Plain>}
              />
            )}
            {hasTemp && (
              <Row
                label={t("slot.fields.nozzle_temp")}
                value={
                  <Plain>
                    {s.nozzle_temp_min ?? "—"} – {s.nozzle_temp_max ?? "—"} °C
                  </Plain>
                }
              />
            )}

            {slot.type === "matched" && spoolmanConfigured && (
              <SectionHeader label={t("slot.sections.sync")} />
            )}
            {slot.type === "matched" && spoolmanConfigured && (
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
                      {slot.sync.status === "synced"
                        ? t("slot.sync_status.synced")
                        : slot.sync.status === "stale"
                          ? t("slot.sync_status.stale")
                          : slot.sync.status === "error"
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
                          loading={syncSlot.isPending}
                          onClick={() =>
                            syncSlot.mutate({
                              serial: slot.slot.printer_serial,
                              amsId: slot.slot.ams_id,
                              slotId: slot.slot.slot_id
                            })
                          }
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
            {slot.type === "matched" &&
              (slot.sync.status === "synced" ||
                slot.sync.status === "stale") && (
                <Row
                  label={t("slot.fields.spoolman_spool")}
                  value={
                    <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
                      <Text
                        size="sm"
                        truncate
                        style={{ flex: 1, minWidth: 0 }}
                      >
                        #{slot.sync.spool_id}
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
                            href={`${spoolmanUrl}/spool/show/${slot.sync.spool_id}`}
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
            {slot.type === "matched" && "at" in slot.sync && (
              <Row
                label={t("slot.fields.sync_last")}
                value={<Plain>{new Date(slot.sync.at).toLocaleString()}</Plain>}
              />
            )}
            {slot.type === "matched" && slot.sync.status === "error" && (
              <Row
                label={t("slot.fields.sync_error")}
                value={<Plain>{slot.sync.error}</Plain>}
              />
            )}

            <SectionHeader label={t("slot.sections.source")} />
            <Row
              label={t("slot.fields.printer_serial")}
              value={<CopyableMono value={s.printer_serial} />}
            />
          </Table.Tbody>
        </Table>
      </Stack>
    </Container>
  );
}
