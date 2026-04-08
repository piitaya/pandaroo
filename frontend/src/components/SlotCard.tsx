import {
  ActionIcon,
  Badge,
  Card,
  Group,
  Progress,
  Stack,
  Text,
  Tooltip
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconCircleFilled,
  IconInfoCircle,
  IconRefresh
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { SlotDetailModal } from "./SlotDetailModal";
import { useMatchStatus } from "./matchStatus";
import { useConfig, useSyncSlotSpoolman } from "../hooks";
import type { MatchedSlot, SlotSyncView } from "../api";

function SyncIndicator({ sync }: { sync: SlotSyncView }) {
  const color =
    sync.status === "synced"
      ? "var(--mantine-color-teal-6)"
      : sync.status === "stale"
        ? "var(--mantine-color-yellow-6)"
        : sync.status === "error"
          ? "var(--mantine-color-red-6)"
          : "var(--mantine-color-gray-5)";
  return <IconCircleFilled size={10} style={{ color }} />;
}

function SyncButton({
  sync,
  loading,
  onClick
}: {
  sync: SlotSyncView;
  loading: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const color =
    sync.status === "synced"
      ? "teal"
      : sync.status === "stale"
        ? "yellow"
        : sync.status === "error"
          ? "red"
          : "gray";
  const tooltip =
    sync.status === "synced"
      ? t("slot.sync_status.synced_tooltip", {
          spool_id: sync.spool_id,
          at: new Date(sync.at).toLocaleString()
        })
      : sync.status === "stale"
        ? t("slot.sync_status.stale_tooltip", {
            spool_id: sync.spool_id,
            at: new Date(sync.at).toLocaleString()
          })
        : sync.status === "error"
          ? t("slot.sync_status.error_tooltip", {
              error: sync.error,
              at: new Date(sync.at).toLocaleString()
            })
          : t("slot.sync_status.never_tooltip");
  return (
    <Tooltip label={tooltip} multiline maw={320}>
      <ActionIcon
        variant="subtle"
        color={color}
        size="sm"
        loading={loading}
        onClick={onClick}
        aria-label={t("slot.sync_aria_label")}
      >
        <IconRefresh size={16} />
      </ActionIcon>
    </Tooltip>
  );
}

/**
 * Bambu reports `"00000000"` (all zeros, including alpha) when a tray
 * has no known color. Any other value is a real color — including
 * `"000000FF"` (opaque black) and `"FFFFFFFF"` (opaque white), which
 * are valid filament colors we must render as-is.
 */
function swatchFill(hex: string | null | undefined): string | null {
  if (!hex || hex === "00000000") return null;
  return `#${hex.slice(0, 6)}`;
}

export function slotKey(s: MatchedSlot): string {
  return `${s.slot.printer_serial}/${s.slot.ams_id}/${s.slot.slot_id}`;
}

/**
 * Traffic-light color for the remaining percentage — matches
 * bambuddy's thresholds (> 50 green, 15–50 amber, < 15 red).
 */
function fillColor(pct: number): string {
  if (pct > 50) return "teal";
  if (pct >= 15) return "yellow";
  return "red";
}

/**
 * Fixed-size color swatch. Shows the slot color when known; otherwise
 * renders a dashed placeholder so empty / unknown-color slots keep the
 * same layout as filled ones.
 */
function ColorSwatch({ hex }: { hex: string | null | undefined }) {
  const background = swatchFill(hex);
  if (background) {
    return (
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 6,
          background,
          border: "1px solid #ddd",
          flexShrink: 0
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 6,
        border: "1px dashed #cbd5e1",
        background:
          "repeating-linear-gradient(45deg, #f8fafc, #f8fafc 4px, #e2e8f0 4px, #e2e8f0 8px)",
        flexShrink: 0
      }}
    />
  );
}

function SlotFill({
  totalGrams,
  remainPct
}: {
  totalGrams: number | null;
  remainPct: number | null;
}) {
  const clamped =
    remainPct != null ? Math.max(0, Math.min(100, remainPct)) : null;
  const remainingGrams =
    clamped != null && totalGrams != null
      ? Math.round((totalGrams * clamped) / 100)
      : null;
  return (
    <Stack gap={2}>
      <Progress
        value={clamped ?? 0}
        color={clamped != null ? fillColor(clamped) : "gray"}
        size="sm"
      />
      <Group justify="space-between" gap={4} wrap="nowrap">
        <Text size="xs" c="dimmed">
          {totalGrams != null && remainingGrams != null
            ? `${remainingGrams} g / ${totalGrams} g`
            : "— g / — g"}
        </Text>
        <Text size="xs" c="dimmed">
          {clamped != null ? `${clamped}%` : "—%"}
        </Text>
      </Group>
    </Stack>
  );
}

export function SlotCard({ s }: { s: MatchedSlot }) {
  const isEmpty = s.type === "empty";
  const [opened, { open, close }] = useDisclosure(false);
  const { t } = useTranslation();
  const matchStatus = useMatchStatus();
  const status = matchStatus[s.type];
  const { data: configData } = useConfig();
  const syncSlot = useSyncSlotSpoolman();
  const spoolmanConfigured = Boolean(configData?.config.spoolman?.url);
  const autoSync = Boolean(configData?.config.spoolman?.auto_sync);
  const canSync = s.type === "matched" && spoolmanConfigured && !autoSync;
  const showIndicator = s.type === "matched" && spoolmanConfigured && autoSync;

  // When we have a mapped color name, promote it to the headline and
  // push the material to the secondary line. Otherwise fall back to
  // the raw MQTT fields (material headline, RFID id as secondary).
  const colorName = s.entry?.color_name;
  const material = s.slot.tray_sub_brands ?? s.slot.tray_type ?? null;
  const headline = isEmpty
    ? t("slot.no_spool_loaded")
    : (colorName ?? material ?? "—");
  const secondary = isEmpty ? null : colorName ? material : s.slot.tray_id_name;

  const totalGrams = s.slot.tray_weight ? Number(s.slot.tray_weight) : null;
  const totalGramsValid =
    totalGrams != null && Number.isFinite(totalGrams) && totalGrams > 0
      ? totalGrams
      : null;

  return (
    <>
      <Card withBorder shadow="sm" radius="md" padding="md">
        <Group justify="space-between" mb="xs" wrap="nowrap">
          <Text fw={500}>{t("slot.label", { n: s.slot.slot_id + 1 })}</Text>
          <Group gap={4} wrap="nowrap">
            <Badge color={status.color} variant="light">
              {status.label}
            </Badge>
            {showIndicator && <SyncIndicator sync={s.sync} />}
            {canSync && (
              <SyncButton
                sync={s.sync}
                loading={syncSlot.isPending}
                onClick={() =>
                  syncSlot.mutate({
                    serial: s.slot.printer_serial,
                    amsId: s.slot.ams_id,
                    slotId: s.slot.slot_id
                  })
                }
              />
            )}
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              onClick={open}
              disabled={isEmpty}
              aria-label={t("slot.details_aria_label")}
            >
              <IconInfoCircle size={16} />
            </ActionIcon>
          </Group>
        </Group>
        <Stack gap="sm">
          <Group gap="sm" align="flex-start" wrap="nowrap">
            <ColorSwatch hex={isEmpty ? null : s.slot.tray_color} />
            <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
              <Text
                size="sm"
                fw={500}
                truncate
                c={isEmpty ? "dimmed" : undefined}
              >
                {headline}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                {secondary ?? "\u00a0"}
              </Text>
            </Stack>
          </Group>
          <SlotFill
            totalGrams={isEmpty ? null : totalGramsValid}
            remainPct={isEmpty ? null : s.slot.remain}
          />
        </Stack>
      </Card>
      {!isEmpty && (
        <SlotDetailModal slot={s} opened={opened} onClose={close} />
      )}
    </>
  );
}
