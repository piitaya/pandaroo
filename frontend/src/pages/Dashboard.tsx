import {
  ActionIcon,
  Alert,
  Group,
  Loader,
  Stack,
  Title
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconHelp, IconPlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { PrinterBlock } from "../components/PrinterBlock";
import { EmptyStateCard } from "../components/EmptyStateCard";
import { StatusLegend } from "../components/StatusLegend";
import { usePrinters } from "../hooks";

export default function DashboardPage() {
  const { data, isLoading, isError, error } = usePrinters();
  const { t } = useTranslation();
  const [legendOpened, { open: openLegend, close: closeLegend }] =
    useDisclosure(false);

  if (isLoading) return <Loader />;
  if (isError) {
    return (
      <Alert color="red" title={t("dashboard.failed_to_load")}>
        {error instanceof Error ? error.message : String(error)}
      </Alert>
    );
  }

  const allPrinters = data ?? [];
  const printers = allPrinters.filter((p) => p.enabled);
  const hasAnyPrinter = allPrinters.length > 0;

  return (
    <Stack gap="xl">
      <Group gap="xs" wrap="nowrap">
        <Title order={2}>{t("dashboard.title")}</Title>
        <ActionIcon
          variant="subtle"
          color="gray"
          onClick={openLegend}
          aria-label={t("dashboard.help_aria_label")}
        >
          <IconHelp size={20} />
        </ActionIcon>
      </Group>

      {printers.length === 0 && !hasAnyPrinter && (
        <EmptyStateCard
          title={t("dashboard.no_printers_title")}
          description={t("dashboard.no_printers_body")}
          action={{
            label: t("dashboard.no_printers_action"),
            to: "/settings/printers",
            state: { openAdd: true },
            icon: <IconPlus size={16} />,
          }}
        />
      )}

      {printers.length === 0 && hasAnyPrinter && (
        <EmptyStateCard
          title={t("dashboard.all_disabled_title")}
          description={t("dashboard.all_disabled_body")}
          action={{
            label: t("dashboard.all_disabled_action"),
            to: "/settings/printers",
            variant: "default",
          }}
        />
      )}

      {printers.map((p) => (
        <PrinterBlock key={p.serial} p={p} />
      ))}

      <StatusLegend opened={legendOpened} onClose={closeLegend} />
    </Stack>
  );
}
