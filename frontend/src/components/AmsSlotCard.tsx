import {
  ActionIcon,
  Badge,
  Card,
  Group,
  Progress,
  Stack,
  Text
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { AmsSlotDetailModal } from "./AmsSlotDetailModal";
import { ColorSwatch } from "./ColorSwatch";
import { useMatchStatus } from "./matchStatus";
import { spoolFillColor } from "./spoolFillColor";
import { SyncDot } from "./SyncDot";
import { useConfig, useSlotSpool } from "../hooks";
import type { AmsSlot } from "../api";

export function amsSlotKey(s: AmsSlot): string {
  return `${s.ams_id}/${s.slot_id}`;
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
        color={clamped != null ? spoolFillColor(clamped) : "gray"}
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

export function AmsSlotCard({ s }: { s: AmsSlot }) {
  const isEmpty = s.match_type === "empty";
  const isUnknownSpool = s.match_type === "unidentified";
  const [opened, { open, close }] = useDisclosure(false);
  const { t } = useTranslation();
  const matchStatus = useMatchStatus();
  const status = matchStatus[s.match_type];
  const { data: configData } = useConfig();
  const spoolmanConfigured = Boolean(configData?.spoolman?.url);
  const persistedSpool = useSlotSpool(s.reading?.tag_id);
  const sync = persistedSpool?.sync;

  const sp = s.reading;
  const colorName = s.color_name;
  const material =
    sp?.product?.trim() || sp?.material?.trim() || null;
  const headline = isEmpty
    ? t("slot.no_spool_loaded")
    : isUnknownSpool
      ? t("slot.unidentified")
      : (colorName ?? material ?? "—");
  const secondary =
    isEmpty || isUnknownSpool
      ? null
      : colorName
        ? material
        : sp?.variant_id;

  const totalGrams = sp?.weight ? Number(sp.weight) : null;
  const totalGramsValid =
    totalGrams != null && Number.isFinite(totalGrams) && totalGrams > 0
      ? totalGrams
      : null;

  return (
    <>
      <Card withBorder shadow="sm" radius="md" padding="md">
        <Group justify="space-between" mb="xs" wrap="nowrap">
          <Text fw={500}>{t("slot.label", { n: s.slot_id + 1 })}</Text>
          <Group gap={4} wrap="nowrap">
            <Badge color={status.color} variant="light">
              {status.label}
            </Badge>
            {s.match_type === "mapped" && spoolmanConfigured && sync && (
              <SyncDot sync={sync} />
            )}
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              onClick={open}
              disabled={isEmpty || isUnknownSpool}
              aria-label={t("slot.details_aria_label")}
            >
              <IconInfoCircle size={16} />
            </ActionIcon>
          </Group>
        </Group>
        <Stack gap="sm">
          <Group gap="sm" align="flex-start" wrap="nowrap">
            <ColorSwatch hex={isEmpty || isUnknownSpool ? null : sp?.color_hex} size={36} />
            <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
              <Text
                size="sm"
                fw={500}
                truncate
                c={isEmpty || isUnknownSpool ? "dimmed" : undefined}
              >
                {headline}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                {secondary ?? "\u00a0"}
              </Text>
            </Stack>
          </Group>
          <SlotFill
            totalGrams={isEmpty || isUnknownSpool ? null : totalGramsValid}
            remainPct={
              isEmpty || isUnknownSpool || sp?.remain == null || sp.remain < 0
                ? null
                : sp.remain
            }
          />
        </Stack>
      </Card>
      {!isEmpty && (
        <AmsSlotDetailModal slot={s} opened={opened} onClose={close} />
      )}
    </>
  );
}
