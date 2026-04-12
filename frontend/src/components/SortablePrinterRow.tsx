import { ActionIcon, Group, Switch, Table, Text } from "@mantine/core";
import { IconEdit, IconGripVertical, IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useSortableItem } from "./useSortableItem";
import type { PrinterRowProps } from "./SortablePrinterCard";

export function SortablePrinterRow({
  printer: p,
  onEdit,
  onDelete,
  onToggleEnabled,
}: PrinterRowProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, isDragging, style } =
    useSortableItem(p.serial);

  return (
    <Table.Tr ref={setNodeRef} style={style}>
      <Table.Td style={{ width: 32 }}>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={t("common.drag_handle")}
          style={{ cursor: isDragging ? "grabbing" : "grab" }}
          {...attributes}
          {...listeners}
        >
          <IconGripVertical size={16} />
        </ActionIcon>
      </Table.Td>
      <Table.Td>{p.name}</Table.Td>
      <Table.Td>{p.host}</Table.Td>
      <Table.Td>
        <Text ff="monospace" size="sm">
          {p.serial}
        </Text>
      </Table.Td>
      <Table.Td>
        <Switch
          checked={p.enabled}
          onChange={(e) => onToggleEnabled(p, e.currentTarget.checked)}
          aria-label={t("printers.columns.enabled")}
        />
      </Table.Td>
      <Table.Td style={{ width: 1, whiteSpace: "nowrap" }}>
        <Group gap="xs" justify="flex-end" wrap="nowrap">
          <ActionIcon
            variant="subtle"
            onClick={() => onEdit(p)}
            aria-label={t("common.edit")}
          >
            <IconEdit size={16} />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="red"
            onClick={() => onDelete(p.serial)}
            aria-label={t("common.remove")}
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}
