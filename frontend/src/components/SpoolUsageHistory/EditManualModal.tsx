import { Button, Group, Modal, Slider, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePatchHistoryEvent } from "../../hooks";
import { spoolFillColor } from "../spoolFillColor";

interface EditManualModalProps {
  opened: boolean;
  onClose: () => void;
  tagId: string;
  eventId: number;
  initialRemain: number | null;
}

export function EditManualModal({
  opened,
  onClose,
  tagId,
  eventId,
  initialRemain,
}: EditManualModalProps) {
  const { t } = useTranslation();
  const patch = usePatchHistoryEvent();
  const [value, setValue] = useState(initialRemain ?? 0);

  useEffect(() => {
    if (opened) setValue(initialRemain ?? 0);
  }, [opened, initialRemain]);

  const handleSave = () => {
    patch.mutate(
      { tagId, eventId, data: { remain: value } },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("spool_detail.usage.manual.edit_title")}
      centered
      size="sm"
    >
      <Stack gap="lg">
        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="sm" fw={600}>
              {value}%
            </Text>
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
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} loading={patch.isPending}>
            {t("common.save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
