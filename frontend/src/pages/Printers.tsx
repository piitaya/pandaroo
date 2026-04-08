import {
  ActionIcon,
  Button,
  Card,
  Group,
  Modal,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { IconEdit, IconGripVertical, IconTrash } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useConfig,
  useCreatePrinter,
  useRemovePrinter,
  useReorderPrinters,
  useUpdatePrinter
} from "../hooks";
import type { Printer, PrinterInput, PrinterPatch } from "../api";

type FormValues = PrinterInput;

const emptyValues: FormValues = {
  name: "",
  host: "",
  serial: "",
  access_code: "",
  enabled: true
};

interface RowProps {
  printer: Printer;
  onEdit: (p: Printer) => void;
  onDelete: (serial: string) => void;
  onToggleEnabled: (p: Printer, enabled: boolean) => void;
}

function SortablePrinterCard({
  printer: p,
  onEdit,
  onDelete,
  onToggleEnabled
}: RowProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: p.serial });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    position: "relative",
    zIndex: isDragging ? 2 : undefined
  };

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

function SortablePrinterRow({
  printer: p,
  onEdit,
  onDelete,
  onToggleEnabled
}: RowProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: p.serial });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    // Keep the dragged row above its neighbours so the shadow doesn't
    // get clipped by the following row during the lift.
    position: "relative",
    zIndex: isDragging ? 2 : undefined
  };

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

export default function PrintersPage() {
  const { data } = useConfig();
  const { t } = useTranslation();
  const create = useCreatePrinter();
  const update = useUpdatePrinter();
  const remove = useRemovePrinter();
  const reorder = useReorderPrinters();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Printer | null>(null);
  const [toRemove, setToDelete] = useState<Printer | null>(null);

  const isMobile = useMediaQuery("(max-width: 48em)") ?? false;

  // Auto-open the add-printer modal when routed here with
  // `state.openAdd: true` (e.g. the Dashboard empty-state CTA).
  // Clear the state after consuming so a page refresh doesn't
  // reopen it.
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const state = location.state as { openAdd?: boolean } | null;
    if (state?.openAdd) {
      setEditing(null);
      open();
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const required = (v: string) =>
    v.trim() ? null : t("printers.form.required");

  const form = useForm<FormValues>({
    initialValues: emptyValues,
    validate: {
      name: required,
      host: required,
      serial: required,
      access_code: required
    }
  });

  useEffect(() => {
    if (opened) {
      form.setValues(editing ?? emptyValues);
      form.resetDirty(editing ?? emptyValues);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, editing]);

  // Local mirror of the printer order for the DnD list. We keep it
  // out of the TanStack cache so dnd-kit's drop-settle animation
  // runs against a stable source of truth — a mid-animation cache
  // invalidation caused the dropped row to visibly jump.
  const remotePrinters = data?.config.printers ?? [];
  const [orderedPrinters, setOrderedPrinters] =
    useState<Printer[]>(remotePrinters);
  const remoteKey = useMemo(
    () => remotePrinters.map((p) => p.serial).join("|"),
    [remotePrinters]
  );
  useEffect(() => {
    // Only pull a new order from the server when the set of serials
    // actually changes (add / delete). Edits to fields don't matter
    // for ordering, so we merge fresh data onto the local order
    // instead of overwriting it mid-drag.
    setOrderedPrinters((prev) => {
      const prevKey = prev.map((p) => p.serial).join("|");
      if (prevKey === remoteKey) {
        // Same serials: keep our order, refresh the per-printer data.
        const bySerial = new Map(remotePrinters.map((p) => [p.serial, p]));
        return prev.map((p) => bySerial.get(p.serial) ?? p);
      }
      return remotePrinters;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteKey, remotePrinters]);

  const printers = orderedPrinters;
  const printerSerials = printers.map((p) => p.serial);

  const openNew = () => {
    setEditing(null);
    open();
  };
  const openEdit = (p: Printer) => {
    setEditing(p);
    open();
  };

  const submit = async (values: FormValues) => {
    try {
      if (editing) {
        // URL param identifies the printer as it currently is; the
        // patch body can include a new serial.
        const patch: PrinterPatch = { ...values };
        await update.mutateAsync({ serial: editing.serial, patch });
      } else {
        await create.mutateAsync(values);
      }
      close();
    } catch {
      // notification already surfaced by the hook's onError
    }
  };

  const toggleEnabled = (p: Printer, enabled: boolean) => {
    update.mutate({ serial: p.serial, patch: { enabled } });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !data) return;
    const oldIndex = printers.findIndex((p) => p.serial === active.id);
    const newIndex = printers.findIndex((p) => p.serial === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(printers, oldIndex, newIndex);
    // Local state first (drives the visual settle animation), then
    // fire-and-forget the server sync.
    setOrderedPrinters(next);
    reorder.mutate({ ...data.config, printers: next });
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>{t("printers.title")}</Title>
        <Button onClick={openNew}>{t("printers.add_printer")}</Button>
      </Group>

      {printers.length === 0 ? (
        <Text c="dimmed">{t("printers.none")}</Text>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={printerSerials}
            strategy={verticalListSortingStrategy}
          >
            {isMobile ? (
              <Stack gap="sm">
                {printers.map((p) => (
                  <SortablePrinterCard
                    key={p.serial}
                    printer={p}
                    onEdit={openEdit}
                    onDelete={(serial) => {
                      const p = printers.find((x) => x.serial === serial);
                      if (p) setToDelete(p);
                    }}
                    onToggleEnabled={toggleEnabled}
                  />
                ))}
              </Stack>
            ) : (
              <Table striped withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th />
                    <Table.Th>{t("printers.columns.name")}</Table.Th>
                    <Table.Th>{t("printers.columns.host")}</Table.Th>
                    <Table.Th>{t("printers.columns.serial")}</Table.Th>
                    <Table.Th>{t("printers.columns.enabled")}</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {printers.map((p) => (
                    <SortablePrinterRow
                      key={p.serial}
                      printer={p}
                      onEdit={openEdit}
                      onDelete={(serial) => {
                      const p = printers.find((x) => x.serial === serial);
                      if (p) setToDelete(p);
                    }}
                      onToggleEnabled={toggleEnabled}
                    />
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </SortableContext>
        </DndContext>
      )}

      <Modal
        opened={opened}
        onClose={close}
        title={editing ? t("printers.edit_printer") : t("printers.add_printer")}
        centered
      >
        <form onSubmit={form.onSubmit(submit)}>
          <Stack>
            <TextInput
              label={t("printers.form.name")}
              {...form.getInputProps("name")}
            />
            <TextInput
              label={t("printers.form.host")}
              placeholder={t("printers.form.host_placeholder")}
              {...form.getInputProps("host")}
            />
            <TextInput
              label={t("printers.form.serial")}
              {...form.getInputProps("serial")}
            />
            <TextInput
              label={t("printers.form.access_code")}
              // Plain text: Chrome flags `type="password"` fields
              // against its breach database, which is nonsense for a
              // LAN-only device access code.
              autoComplete="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              data-bwignore
              {...form.getInputProps("access_code")}
            />
            <Switch
              label={t("printers.form.enabled")}
              {...form.getInputProps("enabled", { type: "checkbox" })}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                loading={create.isPending || update.isPending}
              >
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={toRemove !== null}
        onClose={() => setToDelete(null)}
        title={t("printers.remove_confirm_title")}
        centered
        size="sm"
      >
        <Stack>
          <Text size="sm">
            {t("printers.remove_confirm_body", { name: toRemove?.name ?? "" })}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setToDelete(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              color="red"
              loading={remove.isPending}
              onClick={() => {
                if (!toRemove) return;
                remove.mutate(toRemove.serial, {
                  onSuccess: () => setToDelete(null),
                  onError: () => setToDelete(null)
                });
              }}
            >
              {t("common.remove")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
