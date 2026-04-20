import { Badge, Button, Card, Group, Progress, Stack, Table, Text } from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { amsLabel } from "./amsLabel";
import { ColorSwatch } from "./ColorSwatch";
import { Plain, Row } from "./DetailTable";
import { ResponsiveDetailModal } from "./ResponsiveDetailModal";
import { CopyableMono } from "./CopyableMono";
import { useMatchStatus } from "./matchStatus";
import { spoolFillColor } from "./spoolFillColor";
import { spoolLabels } from "./spoolLabel";
import { SyncDot } from "./SyncDot";
import { useSlotSpool } from "../hooks";
import type { AmsSlot, Spool } from "../api";

function ReadingSection({ slot }: { slot: AmsSlot }) {
  const { t } = useTranslation();
  const matchStatus = useMatchStatus();
  const sp = slot.reading;

  if (!slot.has_spool || !sp) {
    return (
      <Stack gap="xs">
        <SectionTitle>{t("slot.sections.ams_reading")}</SectionTitle>
        <Text size="sm" c="dimmed">{t("slot.no_spool_loaded")}</Text>
      </Stack>
    );
  }

  const status = matchStatus[slot.match_type];
  const hasRemain = sp.remain != null && sp.remain >= 0;
  const hasTemp = sp.temp_min != null || sp.temp_max != null;
  const material = sp.product?.trim() || sp.material?.trim() || null;

  return (
    <Stack gap="xs">
      <Group gap="xs" wrap="nowrap">
        <SectionTitle>{t("slot.sections.ams_reading")}</SectionTitle>
        <Badge color={status.color} variant="light" size="sm">
          {status.label}
        </Badge>
      </Group>
      <Table layout="fixed" withRowBorders>
        <colgroup>
          <col style={{ width: "33%" }} />
          <col style={{ width: "67%" }} />
        </colgroup>
        <Table.Tbody>
          {(slot.color_name || sp.color_hex) && (
            <Row
              label={t("slot.fields.color_name")}
              value={
                <Group gap={8} wrap="nowrap">
                  <ColorSwatch hex={sp.color_hex} />
                  {slot.color_name && (
                    <Text size="sm" truncate>{slot.color_name}</Text>
                  )}
                </Group>
              }
            />
          )}
          {material && (
            <Row label={t("slot.fields.material")} value={<Plain>{material}</Plain>} />
          )}
          {sp.variant_id && (
            <Row
              label={t("slot.fields.bambu_filament")}
              value={<CopyableMono value={sp.variant_id} />}
            />
          )}
          {sp.tag_id && (
            <Row
              label={t("slot.fields.spool_uid")}
              value={<CopyableMono value={sp.tag_id} />}
            />
          )}
          {sp.weight != null && Number.isFinite(sp.weight) && sp.weight > 0 && (
            <Row
              label={t("slot.fields.total_weight")}
              value={<Plain>{sp.weight} g</Plain>}
            />
          )}
          {hasRemain && (
            <Row
              label={t("slot.fields.printer_reports")}
              value={
                <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                  <Progress
                    value={sp.remain!}
                    size="sm"
                    style={{ width: 60, flexShrink: 0 }}
                    color={spoolFillColor(sp.remain!)}
                  />
                  <Text size="sm" style={{ whiteSpace: "nowrap" }}>{sp.remain}%</Text>
                </Group>
              }
            />
          )}
          {hasTemp && (
            <Row
              label={t("slot.fields.nozzle_temp")}
              value={
                <Plain>
                  {sp.temp_min ?? "—"} – {sp.temp_max ?? "—"} °C
                </Plain>
              }
            />
          )}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function LinkedSpoolSection({
  spool,
  onClose,
}: {
  spool: Spool | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Stack gap="xs">
      <SectionTitle>{t("slot.sections.linked_spool")}</SectionTitle>
      {spool ? (
        <LinkedSpoolCard spool={spool} onClose={onClose} />
      ) : (
        <Text size="sm" c="dimmed">{t("slot.linked_spool.not_tracked_hint")}</Text>
      )}
    </Stack>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text size="xs" fw={600} tt="uppercase" c="dimmed">
      {children}
    </Text>
  );
}

function LinkedSpoolCard({ spool, onClose }: { spool: Spool; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const labels = spoolLabels(spool);
  const showSync = spool.match_type === "mapped";

  return (
    <Card withBorder padding="sm" radius="md">
      <Stack gap={4}>
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <ColorSwatch hex={spool.color_hex} size={32} />
          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
            <Text
              size="sm"
              fw={500}
              truncate
              ff={labels.primaryStyle === "code" ? "monospace" : undefined}
            >
              {labels.primary}
            </Text>
            {labels.secondary && (
              <Text size="xs" c="dimmed" truncate>
                {labels.secondary}
              </Text>
            )}
          </Stack>
          {showSync && <SyncDot sync={spool.sync} />}
        </Group>
        <Group justify="space-between" gap="xs" wrap="nowrap" align="flex-end">
          <Text size="xs" c="dimmed" truncate>
            {t("slot.fields.first_seen")}: {new Date(spool.first_seen).toLocaleString()}
          </Text>
          <Button
            variant="default"
            size="xs"
            rightSection={<IconExternalLink size={14} />}
            onClick={() => {
              onClose();
              navigate("/inventory", { state: { selectTagId: spool.tag_id } });
            }}
            style={{ flexShrink: 0 }}
          >
            {t("slot.linked_spool.view_details")}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

export function AmsSlotDetailModal({
  slot,
  opened,
  onClose,
}: {
  slot: AmsSlot;
  opened: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const slotName = t("slot.label", { n: slot.slot_id + 1 });
  const title = `${amsLabel(slot.ams_id)} · ${slotName}`;
  const spool = useSlotSpool(slot.reading?.tag_id);

  return (
    <ResponsiveDetailModal opened={opened} onClose={onClose} title={title}>
      <Stack gap="lg">
        <ReadingSection slot={slot} />
        <LinkedSpoolSection spool={spool} onClose={onClose} />
      </Stack>
    </ResponsiveDetailModal>
  );
}
