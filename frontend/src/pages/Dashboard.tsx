import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Stack,
  Title
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconHelp, IconRefresh, IconRefreshDot } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { PrinterBlock } from "../components/PrinterBlock";
import { StatusLegend } from "../components/StatusLegend";
import { useAppState, useConfig, useSyncAllSpoolman } from "../hooks";

export default function DashboardPage() {
  const { data, isLoading, isError, error } = useAppState();
  const { data: configData } = useConfig();
  const syncAll = useSyncAllSpoolman();
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

  const printers = (data?.printers ?? []).filter((p) => p.enabled);

  const spoolmanConfigured = Boolean(configData?.config.spoolman?.url);
  const autoSync = Boolean(configData?.config.spoolman?.auto_sync);
  const showSyncAll = spoolmanConfigured && !autoSync;

  return (
    <Stack gap="xl">
      <Group justify="space-between" wrap="wrap" gap="sm">
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
        {showSyncAll && (
          <Button
            leftSection={<IconRefresh size={16} />}
            variant="default"
            loading={syncAll.isPending}
            onClick={() => syncAll.mutate()}
          >
            {t("dashboard.sync_all")}
          </Button>
        )}
        {spoolmanConfigured && autoSync && (
          <Badge
            color="teal"
            variant="light"
            size="lg"
            leftSection={<IconRefreshDot size={14} />}
          >
            {t("dashboard.auto_sync_on")}
          </Badge>
        )}
      </Group>

      {printers.length === 0 && (
        <Alert color="blue" title={t("dashboard.no_printers_title")}>
          {t("dashboard.no_printers_body")}
        </Alert>
      )}

      {printers.map((p) => (
        <PrinterBlock key={p.serial} p={p} />
      ))}

      <StatusLegend opened={legendOpened} onClose={closeLegend} />
    </Stack>
  );
}
