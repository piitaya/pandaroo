import { Button, Group, Stack, Table, Text, Title } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
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
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useConfig, useRemovePrinter, useReorderPrinters, useUpdatePrinter } from "../hooks";
import type { Printer } from "../api";
import { SortablePrinterCard } from "../components/SortablePrinterCard";
import { SortablePrinterRow } from "../components/SortablePrinterRow";
import { PrinterFormModal } from "../components/PrinterFormModal";
import { ConfirmModal } from "../components/ConfirmModal";

export default function PrintersPage() {
  const { data } = useConfig();
  const { t } = useTranslation();
  const update = useUpdatePrinter();
  const remove = useRemovePrinter();
  const reorder = useReorderPrinters();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Printer | null>(null);
  const [toRemove, setToRemove] = useState<Printer | null>(null);
  const isMobile = useMediaQuery("(max-width: 48em)") ?? false;

  // Auto-open the add-printer modal when routed here with state.openAdd
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
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Local mirror of printer order for smooth DnD animation
  const remotePrinters = data?.config.printers ?? [];
  const [orderedPrinters, setOrderedPrinters] = useState<Printer[]>(remotePrinters);
  const remoteKey = useMemo(
    () => remotePrinters.map((p) => p.serial).join("|"),
    [remotePrinters],
  );
  useEffect(() => {
    setOrderedPrinters((prev) => {
      const prevKey = prev.map((p) => p.serial).join("|");
      if (prevKey === remoteKey) {
        const bySerial = new Map(remotePrinters.map((p) => [p.serial, p]));
        return prev.map((p) => bySerial.get(p.serial) ?? p);
      }
      return remotePrinters;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteKey, remotePrinters]);

  
  const openNew = () => { setEditing(null); open(); };
  const openEdit = (p: Printer) => { setEditing(p); open(); };
  const toggleEnabled = (p: Printer, enabled: boolean) => {
    update.mutate({ serial: p.serial, patch: { enabled } });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !data) return;
    const oldIndex = orderedPrinters.findIndex((p) => p.serial === active.id);
    const newIndex = orderedPrinters.findIndex((p) => p.serial === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(orderedPrinters, oldIndex, newIndex);
    setOrderedPrinters(next);
    reorder.mutate({ ...data.config, printers: next });
  };

  const rowProps = (p: Printer) => ({
    printer: p,
    onEdit: openEdit,
    onDelete: (serial: string) => {
      const found = orderedPrinters.find((x) => x.serial === serial);
      if (found) setToRemove(found);
    },
    onToggleEnabled: toggleEnabled,
  });

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>{t("printers.title")}</Title>
        <Button onClick={openNew}>{t("printers.add_printer")}</Button>
      </Group>

      {orderedPrinters.length === 0 ? (
        <Text c="dimmed">{t("printers.none")}</Text>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={orderedPrinters.map((p) => p.serial)} strategy={verticalListSortingStrategy}>
            {isMobile ? (
              <Stack gap="sm">
                {orderedPrinters.map((p) => (
                  <SortablePrinterCard key={p.serial} {...rowProps(p)} />
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
                  {orderedPrinters.map((p) => (
                    <SortablePrinterRow key={p.serial} {...rowProps(p)} />
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </SortableContext>
        </DndContext>
      )}

      <PrinterFormModal opened={opened} onClose={close} editing={editing} />

      <ConfirmModal
        opened={toRemove !== null}
        onClose={() => setToRemove(null)}
        onConfirm={() => {
          if (!toRemove) return;
          remove.mutate(toRemove.serial, {
            onSettled: () => setToRemove(null),
          });
        }}
        title={t("printers.remove_confirm_title")}
        body={t("printers.remove_confirm_body", { name: toRemove?.name ?? "" })}
        loading={remove.isPending}
      />
    </Stack>
  );
}
