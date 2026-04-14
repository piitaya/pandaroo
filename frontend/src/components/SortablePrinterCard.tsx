import { ActionIcon, Card, Group, Stack, Switch, Text } from "@mantine/core";
import { IconEdit, IconGripVertical, IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useSortableItem } from "./useSortableItem";
import type { PrinterConfig } from "../api";

export interface PrinterRowProps {
  printer: PrinterConfig;
  onEdit: (p: PrinterConfig) => void;
  onDelete: (serial: string) => void;
  onToggleEnabled: (p: PrinterConfig, enabled: boolean) => void;
}

export function SortablePrinterCard({
  printer: p,
  onEdit,
  onDelete,
  onToggleEnabled,
}: PrinterRowProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, isDragging, style } =
    useSortableItem(p.serial);

  return (
    <Card withBorder padding="sm" radius="md" ref={setNodeRef} style={style}>
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={t("common.drag_handle")}
          style={{ cursor: isDragging ? "grabbing" : "grab", flexShrink: 0 }}
          {...attributes}
          {...listeners}
        >
          <IconGripVertical size={16} />
        </ActionIcon>
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Group gap="xs" wrap="nowrap" align="center">
            <Text fw={500} truncate style={{ flex: 1, minWidth: 0 }}>
              {p.name}
            </Text>
            <Switch
              checked={p.enabled}
              onChange={(e) => onToggleEnabled(p, e.currentTarget.checked)}
              aria-label={t("printers.columns.enabled")}
              style={{ flexShrink: 0 }}
            />
          </Group>
          <Text size="xs" c="dimmed" truncate>
            {p.host}
          </Text>
          <Group gap="xs" wrap="nowrap" align="center">
            <Text
              size="xs"
              c="dimmed"
              ff="monospace"
              truncate
              style={{ flex: 1, minWidth: 0 }}
            >
              {p.serial}
            </Text>
            <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={() => onEdit(p)}
                aria-label={t("common.edit")}
              >
                <IconEdit size={16} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                onClick={() => onDelete(p.serial)}
                aria-label={t("common.remove")}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          </Group>
        </Stack>
      </Group>
    </Card>
  );
}
