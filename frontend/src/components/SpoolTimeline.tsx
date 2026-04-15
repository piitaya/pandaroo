import { Center, Group, Stack, Text, ThemeIcon, Timeline } from "@mantine/core";
import {
  IconLogin2,
  IconLogout2,
  IconPencil,
  IconScan,
  IconWaveSawTool,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { ReactNode } from "react";
import type { SpoolHistoryEvent, SpoolHistoryKind, SpoolHistorySource } from "../api";
import { amsLabel } from "./amsLabel";

export interface SpoolTimelineProps {
  events: SpoolHistoryEvent[] | undefined;
  loading?: boolean;
}

interface EventVisual {
  icon: ReactNode;
  color: string;
  title: string;
}

function describeLocation(event: SpoolHistoryEvent, t: TFunction): string | null {
  if (event.ams_id == null || event.slot_id == null) return null;
  return `${amsLabel(event.ams_id)} · ${t("slot.label", { n: event.slot_id + 1 })}`;
}

function visualFor(
  event: SpoolHistoryEvent,
  t: TFunction,
): EventVisual {
  const sourceLabel: Record<SpoolHistorySource, string> = {
    ams: t("spool_detail.timeline.source.ams"),
    scan: t("spool_detail.timeline.source.scan"),
    manual: t("spool_detail.timeline.source.manual"),
  };

  const kind: SpoolHistoryKind = event.kind;
  if (kind === "slot_enter") {
    return {
      icon: <IconLogin2 size={14} />,
      color: "teal",
      title: t("spool_detail.timeline.titles.slot_enter"),
    };
  }
  if (kind === "slot_exit") {
    return {
      icon: <IconLogout2 size={14} />,
      color: "gray",
      title: t("spool_detail.timeline.titles.slot_exit"),
    };
  }
  if (event.source === "scan") {
    return {
      icon: <IconScan size={14} />,
      color: "blue",
      title: t("spool_detail.timeline.titles.scanned"),
    };
  }
  if (event.source === "manual") {
    return {
      icon: <IconPencil size={14} />,
      color: "violet",
      title: t("spool_detail.timeline.titles.adjusted"),
    };
  }
  return {
    icon: <IconWaveSawTool size={14} />,
    color: "blue",
    title: `${t("spool_detail.timeline.titles.update")} (${sourceLabel[event.source]})`,
  };
}

function describeRemainDelta(
  event: SpoolHistoryEvent,
  prev: SpoolHistoryEvent | undefined,
  t: TFunction,
): string | null {
  if (event.remain == null) return null;
  if (!prev || prev.remain == null) {
    return t("spool_detail.timeline.body.remain", { value: event.remain });
  }
  if (prev.remain === event.remain) return null;
  return t("spool_detail.timeline.body.remain_delta", {
    from: prev.remain,
    to: event.remain,
  });
}

export function SpoolTimeline({ events, loading }: SpoolTimelineProps) {
  const { t } = useTranslation();

  if (!loading && (!events || events.length === 0)) {
    return (
      <Center mih={120}>
        <Stack gap={4} align="center">
          <Text c="dimmed" size="sm">
            {t("spool_detail.timeline.empty_title")}
          </Text>
          <Text c="dimmed" size="xs">
            {t("spool_detail.timeline.empty_hint")}
          </Text>
        </Stack>
      </Center>
    );
  }

  // events arrive newest-first; for delta we need previous (older) event.
  // We pre-sort ascending to compute deltas, then render reverse.
  const ascending = [...(events ?? [])].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  return (
    <Timeline active={ascending.length} bulletSize={28} lineWidth={2}>
      {ascending
        .map((event, index) => {
          const prev = index > 0 ? ascending[index - 1] : undefined;
          const visual = visualFor(event, t);
          const location = describeLocation(event, t);
          const delta = describeRemainDelta(event, prev, t);
          const when = new Date(event.created_at).toLocaleString();

          return (
            <Timeline.Item
              key={event.id}
              bullet={
                <ThemeIcon size={28} radius="xl" variant="light" color={visual.color}>
                  {visual.icon}
                </ThemeIcon>
              }
              title={
                <Group justify="space-between" gap="sm" wrap="nowrap">
                  <Text size="sm" fw={600}>
                    {visual.title}
                  </Text>
                  <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                    {when}
                  </Text>
                </Group>
              }
            >
              <Stack gap={2}>
                {location && (
                  <Text size="xs" c="dimmed">
                    {location}
                  </Text>
                )}
                {delta && <Text size="xs">{delta}</Text>}
              </Stack>
            </Timeline.Item>
          );
        })
        .reverse()}
    </Timeline>
  );
}
