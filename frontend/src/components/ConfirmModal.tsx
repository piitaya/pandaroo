import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

interface ConfirmModalProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body?: string;
  loading?: boolean;
}

export function ConfirmModal({
  opened,
  onClose,
  onConfirm,
  title,
  body,
  loading,
}: ConfirmModalProps) {
  const { t } = useTranslation();
  return (
    <Modal opened={opened} onClose={onClose} title={title} centered size="sm">
      <Stack>
        {body && <Text size="sm">{body}</Text>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button color="red" loading={loading} onClick={onConfirm}>
            {t("common.remove")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
