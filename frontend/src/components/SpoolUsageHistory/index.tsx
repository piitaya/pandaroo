import { Stack, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { SpoolHistoryEvent } from "../../api";
import { Timeline } from "./Timeline";
import { useSpoolUsageModel } from "./useSpoolUsageModel";

interface SpoolUsageHistoryProps {
  events: SpoolHistoryEvent[] | undefined;
}

export function SpoolUsageHistory({ events }: SpoolUsageHistoryProps) {
  const { t } = useTranslation();
  const model = useSpoolUsageModel(events);

  return (
    <Stack gap="md">
      <Title order={4}>{t("spool_detail.usage.title")}</Title>
      <Timeline model={model} />
    </Stack>
  );
}
