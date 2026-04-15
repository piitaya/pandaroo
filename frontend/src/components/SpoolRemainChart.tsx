import { LineChart } from "@mantine/charts";
import { Center, Stack, Text } from "@mantine/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { SpoolHistoryEvent } from "../api";

export interface SpoolRemainChartProps {
  events: SpoolHistoryEvent[] | undefined;
  range: { from: string; to: string };
  currentRemain: number | null;
  loading?: boolean;
}

interface ChartPoint {
  date: string;
  remain: number;
}

function buildSeries(
  events: SpoolHistoryEvent[],
  range: { from: string; to: string },
  currentRemain: number | null,
): ChartPoint[] {
  const ascending = [...events]
    .filter((e) => e.remain != null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const points: ChartPoint[] = ascending.map((e) => ({
    date: e.created_at,
    remain: e.remain as number,
  }));

  // Append a "now" anchor so the line continues to the right edge of the
  // selected range with the current remain value. Only add it when we have
  // at least one historical point and the latest known remain differs or is
  // older than the range end.
  if (currentRemain != null && points.length > 0) {
    const last = points[points.length - 1];
    const rangeEndMs = new Date(range.to).getTime();
    const lastMs = new Date(last.date).getTime();
    if (lastMs < rangeEndMs - 60_000 || last.remain !== currentRemain) {
      points.push({ date: range.to, remain: currentRemain });
    }
  }

  return points;
}

function formatTick(value: string): string {
  const d = new Date(value);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function SpoolRemainChart({
  events,
  range,
  currentRemain,
  loading,
}: SpoolRemainChartProps) {
  const { t } = useTranslation();
  const data = useMemo(
    () => buildSeries(events ?? [], range, currentRemain),
    [events, range, currentRemain],
  );

  if (!loading && data.length === 0) {
    return (
      <Center mih={240}>
        <Stack gap={4} align="center">
          <Text c="dimmed" size="sm">
            {t("spool_detail.chart.empty_title")}
          </Text>
          <Text c="dimmed" size="xs">
            {t("spool_detail.chart.empty_hint")}
          </Text>
        </Stack>
      </Center>
    );
  }

  return (
    <LineChart
      h={260}
      data={data}
      dataKey="date"
      withDots={data.length <= 60}
      curveType="stepAfter"
      yAxisProps={{ domain: [0, 100], tickFormatter: (v) => `${v}%` }}
      xAxisProps={{ tickFormatter: formatTick, minTickGap: 32 }}
      valueFormatter={(v) => `${v}%`}
      series={[
        {
          name: "remain",
          color: "teal.6",
          label: t("spool_detail.chart.remain_label"),
        },
      ]}
      tooltipProps={{
        labelFormatter: (label) => new Date(label as string).toLocaleString(),
      }}
    />
  );
}
