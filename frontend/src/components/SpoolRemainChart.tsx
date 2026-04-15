import {
  ActionIcon,
  Badge,
  Center,
  ColorSwatch,
  Group,
  Popover,
  Paper,
  Slider,
  Stack,
  Text,
} from "@mantine/core";
import { IconAdjustmentsAlt } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SpoolHistoryEvent } from "../api";

export interface SpoolRemainChartProps {
  events: SpoolHistoryEvent[] | undefined;
  range: { from: string; to: string };
  currentRemain: number | null;
  loading?: boolean;
}

interface ChartPoint {
  ts: number;
  remain: number;
}

const ONE_DAY_MS = 86_400_000;
const ONE_HOUR_MS = 3_600_000;

function buildSeries(
  events: SpoolHistoryEvent[],
  range: { from: string; to: string },
  currentRemain: number | null,
): ChartPoint[] {
  const ascending = [...events]
    .filter((e) => e.remain != null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const points: ChartPoint[] = ascending.map((e) => ({
    ts: new Date(e.created_at).getTime(),
    remain: e.remain as number,
  }));

  if (currentRemain != null && points.length > 0) {
    const last = points[points.length - 1];
    const rangeEndMs = new Date(range.to).getTime();
    if (last.ts < rangeEndMs - 60_000 || last.remain !== currentRemain) {
      points.push({ ts: rangeEndMs, remain: currentRemain });
    }
  }

  return points;
}

// Inserts "hold" points just before each actual reading when the gap since the
// previous reading exceeds `gapThresholdMs`. The hold point carries the previous
// value, so a subsequent `monotone` curve stays flat across the gap and only
// transitions over the last `transitionRatio` of it.
function withHoldPoints(
  points: ChartPoint[],
  gapThresholdMs: number,
  transitionRatio: number,
): ChartPoint[] {
  if (points.length < 2) return points;
  const result: ChartPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[i - 1];
    if (prev && p.ts - prev.ts > gapThresholdMs) {
      const gap = p.ts - prev.ts;
      result.push({ ts: p.ts - gap * transitionRatio, remain: prev.remain });
    }
    result.push(p);
  }
  return result;
}

function makeTickFormatter(spanMs: number) {
  if (spanMs < ONE_DAY_MS) {
    return (v: number) =>
      new Date(v).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
  }
  return (v: number) =>
    new Date(v).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
}

function formatTooltipLabel(value: number): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
  stroke?: string;
}

function RemainTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: number | string;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <Paper px="md" py="sm" withBorder shadow="md" radius="md">
      <Text fw={600} fz="sm" mb={6}>
        {formatTooltipLabel(Number(label))}
      </Text>
      <Stack gap={4}>
        {payload.map((item) => (
          <Group key={item.name} gap={8} wrap="nowrap">
            <ColorSwatch color={item.stroke ?? item.color} size={10} withShadow={false} />
            <Text fz="sm" c="dimmed">
              {item.name}
            </Text>
            <Text fz="sm" fw={600} ml="auto">
              {item.value}%
            </Text>
          </Group>
        ))}
      </Stack>
    </Paper>
  );
}

export function SpoolRemainChart({
  events,
  range,
  currentRemain,
  loading,
}: SpoolRemainChartProps) {
  const { t } = useTranslation();
  const [transitionPct, setTransitionPct] = useState(10);
  const [gapHours, setGapHours] = useState(1);

  const raw = useMemo(
    () => buildSeries(events ?? [], range, currentRemain),
    [events, range, currentRemain],
  );

  const held = useMemo(
    () => withHoldPoints(raw, gapHours * ONE_HOUR_MS, transitionPct / 100),
    [raw, gapHours, transitionPct],
  );

  if (!loading && raw.length === 0) {
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

  const spanMs =
    raw.length > 1 ? raw[raw.length - 1].ts - raw[0].ts : ONE_DAY_MS;
  const tickFormatter = makeTickFormatter(spanMs);

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Popover position="bottom-end" withArrow shadow="md">
          <Popover.Target>
            <ActionIcon variant="subtle" color="gray" aria-label="Debug lissage">
              <IconAdjustmentsAlt size={18} />
            </ActionIcon>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap="md" miw={260}>
              <Group gap={6}>
                <Badge size="xs" color="orange" variant="light">
                  DEBUG
                </Badge>
                <Text size="xs" c="dimmed">
                  Réglage du lissage de la courbe
                </Text>
              </Group>
              <Stack gap={2}>
                <Text size="xs" c="dimmed">
                  Seuil de « rien ne s'est passé » : {gapHours} h
                </Text>
                <Slider
                  min={0}
                  max={48}
                  step={1}
                  value={gapHours}
                  onChange={setGapHours}
                />
              </Stack>
              <Stack gap={2}>
                <Text size="xs" c="dimmed">
                  Largeur de la transition : {transitionPct}% du gap
                </Text>
                <Slider
                  min={1}
                  max={50}
                  step={1}
                  value={transitionPct}
                  onChange={setTransitionPct}
                />
              </Stack>
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </Group>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={held} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickCount={6}
            tickFormatter={tickFormatter}
            minTickGap={40}
          />
          <YAxis domain={[0, 100]} tickCount={5} tickFormatter={(v) => `${v}%`} />
          <Tooltip content={<RemainTooltip />} />
          <Line
            type="monotone"
            dataKey="remain"
            name={t("spool_detail.chart.remain_label")}
            stroke="var(--mantine-color-teal-6)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--mantine-color-body)" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Stack>
  );
}
