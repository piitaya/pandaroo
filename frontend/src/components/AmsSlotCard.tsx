import {
  Badge,
  Card,
  Group,
  Progress,
  Stack,
  Text
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import { AmsSlotDetailModal } from "./AmsSlotDetailModal";
import { ColorSwatch } from "./ColorSwatch";
import { spoolHexes } from "./spoolLabel";
import { useMatchStatus } from "./matchStatus";
import { spoolFillColor } from "./spoolFillColor";
import { spoolLabels } from "./spoolLabel";
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
        <Text size="xs" c="dimmed" truncate style={{ flex: 1, minWidth: 0 }}>
          {totalGrams != null && remainingGrams != null
            ? `${remainingGrams} g / ${totalGrams} g`
            : "— g / — g"}
        </Text>
        <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
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

  const sp = s.reading;
  const labels =
    isEmpty || isUnknownSpool || !sp
      ? null
      : spoolLabels({ ...sp, color_name: s.color_name });
  const headline = isEmpty
    ? t("slot.no_spool_loaded")
    : isUnknownSpool
      ? t("slot.unidentified")
      : (labels?.primary ?? "—");
  const secondary = labels?.secondary ?? null;
  const headlineMono = labels?.primaryStyle === "code";

  const totalGrams = sp?.weight ? Number(sp.weight) : null;
  const totalGramsValid =
    totalGrams != null && Number.isFinite(totalGrams) && totalGrams > 0
      ? totalGrams
      : null;

  const isActionable = !isEmpty && !isUnknownSpool;

  return (
    <>
      <Card
        withBorder
        radius="md"
        padding={8}
        onClick={isActionable ? open : undefined}
        onKeyDown={
          isActionable
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  open();
                }
              }
            : undefined
        }
        role={isActionable ? "button" : undefined}
        tabIndex={isActionable ? 0 : undefined}
        aria-label={isActionable ? t("slot.details_aria_label") : undefined}
        style={{
          cursor: isActionable ? "pointer" : undefined,
          opacity: isEmpty ? 0.55 : undefined,
          borderStyle: isEmpty ? "dashed" : undefined,
        }}
      >
        <Group justify="space-between" mb={6} wrap="nowrap" gap={4}>
          <Text size="xs" fw={500} c="dimmed" truncate style={{ minWidth: 0 }}>
            {t("slot.label", { n: s.slot_id + 1 })}
          </Text>
          <Badge
            size="xs"
            color={status.color}
            variant="light"
            style={{ flexShrink: 0 }}
          >
            {status.label}
          </Badge>
        </Group>
        <Stack gap={6}>
          <Group gap="xs" align="flex-start" wrap="nowrap">
            <ColorSwatch
              hexes={isEmpty || isUnknownSpool || !sp ? [] : spoolHexes(sp)}
              size={28}
              round
            />
            <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
              <Text
                size="sm"
                fw={500}
                truncate
                ff={headlineMono ? "monospace" : undefined}
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
