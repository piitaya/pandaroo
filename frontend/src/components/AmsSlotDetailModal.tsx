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
import { amsLabel } from "./amsLabel";
import { useMatchStatus } from "./matchStatus";
import { syncStatusColor } from "./syncStatusColor";
import {
  useConfig,
  useSpoolmanBaseUrl,
  useSyncSpoolman
} from "../hooks";
import type { AmsMatchedSlot } from "../api";

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

export function AmsSlotDetailModal({
  slot,
  opened,
  onClose
}: {
  slot: AmsMatchedSlot;
  opened: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const matchStatus = useMatchStatus();
  const { data: spoolmanBaseUrl } = useSpoolmanBaseUrl();
  const spoolmanUrl = spoolmanBaseUrl?.replace(/\/+$/, "") ?? null;
  const { data: configData } = useConfig();
  const syncSpoolman = useSyncSpoolman();
  const spoolmanConfigured = Boolean(configData?.config.spoolman?.url);
  const autoSync = Boolean(configData?.config.spoolman?.auto_sync);
  const canManualSync =
    slot.type === "matched" && spoolmanConfigured && !autoSync;
  const syncDotColor = syncStatusColor(slot.sync.status);
  const s = slot.slot;
  const sp = s.spool;
  const slotName = t("slot.label", { n: s.slot_id + 1 });
  const title = `${amsLabel(s.ams_id)} · ${slotName}`;
  const hasTemp = sp?.temp_min != null || sp?.temp_max != null;
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
                sp?.color_hexes && sp?.color_hexes.length > 0
                  ? sp?.color_hexes
                  : sp?.color_hex
                    ? [sp?.color_hex]
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
                  {sp?.product?.trim() ||
                    sp?.material?.trim() ||
                    "—"}
                </Plain>
              }
            />

            <SectionHeader label={t("slot.sections.identification")} />
            {sp?.variant_id && (
              <Row
                label={t("slot.fields.bambu_filament")}
                value={<CopyableMono value={sp?.variant_id} />}
              />
            )}
            {slot.entry?.spoolman_id && (
              <Row
                label={t("slot.fields.spoolman_filament")}
                value={<CopyableMono value={slot.entry.spoolman_id} />}
              />
            )}
            {sp?.uid && (
              <Row
                label={t("slot.fields.spool_uid")}
                value={<CopyableMono value={sp?.uid} />}
              />
            )}

            <SectionHeader label={t("slot.sections.physical")} />
            {(() => {
              const w = sp?.weight ? Number(sp?.weight) : NaN;
              if (!Number.isFinite(w) || w <= 0) return null;
              return (
                <Row
                  label={t("slot.fields.total_weight")}
                  value={<Plain>{w} g</Plain>}
                />
              );
            })()}
            {sp?.remain != null && sp?.remain >= 0 && (
              <Row
                label={t("slot.fields.remaining")}
                value={<Plain>{sp?.remain}%</Plain>}
              />
            )}
            {hasTemp && (
              <Row
                label={t("slot.fields.nozzle_temp")}
                value={
                  <Plain>
                    {sp?.temp_min ?? "—"} – {sp?.temp_max ?? "—"} °C
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
                          loading={syncSpoolman.isPending}
                          onClick={() => {
                            const uid = slot.slot.spool?.uid;
                            if (uid) syncSpoolman.mutate([uid]);
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
                        #{slot.sync.spoolman_spool_id}
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
                            href={`${spoolmanUrl}/spool/show/${slot.sync.spoolman_spool_id}`}
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
