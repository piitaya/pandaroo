import { Button, Group, Modal, Slider, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { usePatchSpool } from "../hooks";
import { spoolFillColor } from "./spoolFillColor";
import type { Spool } from "../api";

export function AdjustRemainModal({
  spool,
  opened,
  onClose
}: {
  spool: Spool;
  opened: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(spool.remain ?? 0);
  const patchSpool = usePatchSpool();

  const totalWeight = spool.weight ?? 0;
  const remainingWeight = totalWeight > 0 ? Math.round(totalWeight * value / 100) : null;

  const handleSave = () => {
    patchSpool.mutate(
      { tagId: spool.tag_id, data: { remain: value } },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("spools.adjust_remain_title")}
      centered
      size="sm"
    >
      <Stack gap="lg">
        <Text size="sm" c="dimmed">
          {spool.color_name ?? spool.product ?? spool.material ?? spool.tag_id}
        </Text>
        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="sm" fw={600}>{value}%</Text>
            {remainingWeight != null && (
              <Text size="sm" c="dimmed">{remainingWeight} / {totalWeight} g</Text>
            )}
          </Group>
          <Slider
            value={value}
            onChange={setValue}
            min={0}
            max={100}
            step={1}
            label={null}
            color={spoolFillColor(value)}
          />
        </Stack>
        <Text size="xs" c="dimmed">{t("spools.adjust_remain_hint")}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} loading={patchSpool.isPending}>
            {t("common.save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
