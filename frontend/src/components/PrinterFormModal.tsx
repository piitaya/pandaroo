import { Button, Group, Modal, Stack, Switch, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useCreatePrinter, useUpdatePrinter } from "../hooks";
import type { Printer, PrinterInput } from "../api";

const emptyValues: PrinterInput = {
  name: "",
  host: "",
  serial: "",
  access_code: "",
  enabled: true,
};

interface PrinterFormModalProps {
  opened: boolean;
  onClose: () => void;
  editing: Printer | null;
}

export function PrinterFormModal({ opened, onClose, editing }: PrinterFormModalProps) {
  const { t } = useTranslation();
  const create = useCreatePrinter();
  const update = useUpdatePrinter();

  const required = (v: string) =>
    v.trim() ? null : t("printers.form.required");

  const form = useForm<PrinterInput>({
    initialValues: emptyValues,
    validate: {
      name: required,
      host: required,
      serial: required,
      access_code: required,
    },
  });

  useEffect(() => {
    if (opened) {
      form.setValues(editing ?? emptyValues);
      form.resetDirty(editing ?? emptyValues);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, editing]);

  const submit = async (values: PrinterInput) => {
    try {
      if (editing) {
        await update.mutateAsync({ serial: editing.serial, patch: { ...values } });
      } else {
        await create.mutateAsync(values);
      }
      onClose();
    } catch {
      // notification already surfaced by the hook's onError
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
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
            <Button variant="default" onClick={onClose}>
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
  );
}
