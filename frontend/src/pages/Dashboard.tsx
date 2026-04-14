import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Menu,
  Stack,
  Text,
  Title
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconChevronDown,
  IconHelp,
  IconPlugConnected,
  IconPlus,
  IconRefresh,
  IconRefreshDot
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { PrinterBlock } from "../components/PrinterBlock";
import { EmptyStateCard } from "../components/EmptyStateCard";
import { StatusLegend } from "../components/StatusLegend";
import { collectActiveTagIds } from "../api";
import {
  usePrinters,
  useConfig,
  useSyncAllSpoolman,
  useSyncSpoolman
} from "../hooks";

export default function DashboardPage() {
  const { data, isLoading, isError, error } = usePrinters();
  const { data: configData } = useConfig();
  const syncSpoolman = useSyncSpoolman();
  const syncAllSpoolman = useSyncAllSpoolman();
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

  const spoolmanConfigured = Boolean(configData?.spoolman?.url);
  const autoSync = Boolean(configData?.spoolman?.auto_sync);
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
          <Menu position="bottom-end" withArrow>
            <Menu.Target>
              <Button
                leftSection={<IconRefresh size={16} />}
                rightSection={<IconChevronDown size={14} />}
                variant="default"
                loading={syncSpoolman.isPending || syncAllSpoolman.isPending}
              >
                {t("dashboard.sync_all")}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => syncAllSpoolman.mutate()}>
                {t("dashboard.sync_menu.all_spools")}
              </Menu.Item>
              <Menu.Item
                onClick={() =>
                  syncSpoolman.mutate(data ? collectActiveTagIds(data) : [])
                }
              >
                {t("dashboard.sync_menu.ams_loaded")}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
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

      {printers.length === 0 && !hasAnyPrinter && (
        <EmptyStateCard
          title={t("dashboard.no_printers_title")}
          description={t("dashboard.no_printers_body")}
          action={{
            label: t("dashboard.no_printers_action"),
            to: "/printers",
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
            to: "/printers",
            variant: "default",
          }}
        />
      )}

      {printers.length > 0 && !spoolmanConfigured && (
        <Card withBorder padding="md" radius="md">
          <Group justify="space-between" wrap="wrap" gap="md" align="center">
            <Stack gap={2} style={{ flex: "1 1 260px", minWidth: 0 }}>
              <Text fw={500}>{t("dashboard.no_spoolman_title")}</Text>
              <Text size="sm" c="dimmed">
                {t("dashboard.no_spoolman_body")}
              </Text>
            </Stack>
            <Button
              component={Link}
              to="/sync"
              variant="default"
              leftSection={<IconPlugConnected size={16} />}
            >
              {t("dashboard.no_spoolman_action")}
            </Button>
          </Group>
        </Card>
      )}

      {printers.map((p) => (
        <PrinterBlock key={p.serial} p={p} />
      ))}

      <StatusLegend opened={legendOpened} onClose={closeLegend} />
    </Stack>
  );
}
