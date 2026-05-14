import {
  Alert,
  Card,
  Group,
  Loader,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { BarChart, DonutChart } from "@mantine/charts";
import {
  IconCylinder,
  IconFlask,
  IconPalette,
  IconWeight,
  type Icon,
} from "@tabler/icons-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { EmptyStateCard } from "../components/EmptyStateCard";
import { PageShell } from "../components/PageShell";
import { useSpools } from "../hooks";
import { formatGrams } from "../lib/format";
import {
  COLOR_FAMILIES,
  FAMILY_HEX,
  colorFamily,
  type ColorFamily,
} from "../lib/colorFamily";
import { spoolHexes } from "../components/spoolLabel";
import { swatchFill } from "../components/ColorSwatch";
import type { Spool } from "../api";

const MATERIAL_PALETTE = [
  "blue.6",
  "teal.6",
  "violet.6",
  "orange.6",
  "pink.6",
  "lime.6",
  "cyan.6",
  "grape.6",
  "yellow.6",
  "indigo.6",
];

const TOP_PRODUCTS = 10;

interface Aggregates {
  total: number;
  totalRemaining: number;
  distinctColors: number;
  byMaterial: Array<{ name: string; value: number; color: string }>;
  byColor: Array<{ family: ColorFamily; count: number; hex: string }>;
  byProduct: Array<{ name: string; count: number }>;
}

function aggregate(spools: Spool[]): Aggregates {
  let totalRemaining = 0;
  const materialCounts = new Map<string, number>();
  const colorCounts = new Map<ColorFamily, number>();
  const productCounts = new Map<string, number>();
  const distinctColorKeys = new Set<string>();

  for (const s of spools) {
    const w = s.weight ?? 0;
    if (s.remain != null && s.remain >= 0) {
      totalRemaining += (w * s.remain) / 100;
    } else {
      totalRemaining += w;
    }

    const colorKey =
      s.color_name?.trim() ||
      (s.color_hexes && s.color_hexes.length > 0
        ? s.color_hexes.join("|")
        : s.color_hex?.trim());
    if (colorKey) distinctColorKeys.add(colorKey);

    const mat = s.material?.trim();
    if (mat) materialCounts.set(mat, (materialCounts.get(mat) ?? 0) + 1);

    const primaryHex = spoolHexes(s)[0];
    const family = colorFamily(swatchFill(primaryHex));
    if (family) colorCounts.set(family, (colorCounts.get(family) ?? 0) + 1);

    const prod = s.product?.trim();
    if (prod) productCounts.set(prod, (productCounts.get(prod) ?? 0) + 1);
  }

  const byMaterial = Array.from(materialCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], i) => ({
      name,
      value,
      color: MATERIAL_PALETTE[i % MATERIAL_PALETTE.length]!,
    }));

  const byColor = COLOR_FAMILIES.filter((f) => colorCounts.has(f)).map((f) => ({
    family: f,
    count: colorCounts.get(f)!,
    hex: FAMILY_HEX[f],
  }));

  const byProduct = Array.from(productCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_PRODUCTS)
    .map(([name, count]) => ({ name, count }));

  return {
    total: spools.length,
    totalRemaining,
    distinctColors: distinctColorKeys.size,
    byMaterial,
    byColor,
    byProduct,
  };
}

function StatTile({
  label,
  value,
  icon: IconComponent,
  color,
}: {
  label: string;
  value: string;
  icon: Icon;
  color: string;
}) {
  return (
    <Card withBorder radius="md" padding="md">
      <Group gap="md" wrap="nowrap" align="center">
        <ThemeIcon size={40} radius="md" variant="light" color={color}>
          <IconComponent size={22} stroke={1.5} />
        </ThemeIcon>
        <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
          <Text size="xs" tt="uppercase" fw={600} c="dimmed" truncate>
            {label}
          </Text>
          <Text size="xl" fw={700} style={{ lineHeight: 1.1 }}>
            {value}
          </Text>
        </Stack>
      </Group>
    </Card>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card withBorder radius="md" padding="md">
      <Stack gap="sm">
        <Title order={5}>{title}</Title>
        {children}
      </Stack>
    </Card>
  );
}

function ColorDistribution({
  data,
  t,
}: {
  data: Aggregates["byColor"];
  t: (key: string) => string;
}) {
  const max = data.reduce((m, d) => Math.max(m, d.count), 0);
  if (data.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {t("stats.no_data")}
      </Text>
    );
  }
  return (
    <Stack gap="xs">
      {data.map(({ family, count, hex }) => (
        <Group key={family} gap="sm" wrap="nowrap" align="center">
          <Text
            size="sm"
            style={{ width: 80, flexShrink: 0 }}
            tt="capitalize"
          >
            {t(`color_family.${family}`)}
          </Text>
          <Progress.Root
            size="lg"
            style={{ flex: 1, minWidth: 0, height: 20 }}
          >
            <Progress.Section
              value={(count / max) * 100}
              color={hex}
              style={{ transition: "width 200ms" }}
            />
          </Progress.Root>
          <Text
            size="sm"
            fw={500}
            style={{ width: 32, textAlign: "right", flexShrink: 0 }}
          >
            {count}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}

export default function StatsPage() {
  const { data, isLoading, isError, error } = useSpools();
  const { t } = useTranslation();

  const stats = useMemo(() => aggregate(data ?? []), [data]);

  if (isLoading)
    return (
      <PageShell>
        <Loader />
      </PageShell>
    );
  if (isError) {
    return (
      <PageShell>
        <Alert color="red" title={t("stats.failed_to_load")}>
          {error instanceof Error ? error.message : String(error)}
        </Alert>
      </PageShell>
    );
  }

  if (stats.total === 0) {
    return (
      <PageShell>
        <Stack gap="xl">
          <Title order={2}>{t("stats.title")}</Title>
          <EmptyStateCard
            title={t("stats.empty_title")}
            description={t("stats.empty_body")}
          />
        </Stack>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Stack gap="xl">
        <Title order={2}>{t("stats.title")}</Title>

        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
          <StatTile
            label={t("stats.tiles.spools")}
            value={String(stats.total)}
            icon={IconCylinder}
            color="blue"
          />
          <StatTile
            label={t("stats.tiles.remaining")}
            value={formatGrams(stats.totalRemaining)}
            icon={IconWeight}
            color="teal"
          />
          <StatTile
            label={t("stats.tiles.materials")}
            value={String(stats.byMaterial.length)}
            icon={IconFlask}
            color="violet"
          />
          <StatTile
            label={t("stats.tiles.colors")}
            value={String(stats.distinctColors)}
            icon={IconPalette}
            color="pink"
          />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <SectionCard title={t("stats.by_material")}>
            {stats.byMaterial.length > 0 ? (
              <Group gap="lg" wrap="nowrap" align="center">
                <DonutChart
                  data={stats.byMaterial}
                  size={180}
                  thickness={28}
                  withTooltip
                  tooltipDataSource="segment"
                  paddingAngle={2}
                />
                <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
                  {stats.byMaterial.map(({ name, value, color }) => (
                    <Group key={name} gap="xs" wrap="nowrap">
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 2,
                          background: `var(--mantine-color-${color.replace(".", "-")})`,
                          flexShrink: 0,
                        }}
                      />
                      <Text size="sm" truncate style={{ flex: 1 }}>
                        {name}
                      </Text>
                      <Text size="sm" fw={500}>
                        {value}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              </Group>
            ) : (
              <Text size="sm" c="dimmed">
                {t("stats.no_data")}
              </Text>
            )}
          </SectionCard>

          <SectionCard title={t("stats.by_color")}>
            <ColorDistribution data={stats.byColor} t={t} />
          </SectionCard>
        </SimpleGrid>

        <SectionCard title={t("stats.by_product")}>
          {stats.byProduct.length > 0 ? (
            <BarChart
              h={Math.max(stats.byProduct.length * 32, 160)}
              data={stats.byProduct}
              dataKey="name"
              orientation="vertical"
              yAxisProps={{ width: 140 }}
              series={[{ name: "count", color: "blue.6" }]}
              withTooltip
              withBarValueLabel
              barProps={{ radius: 4 }}
            />
          ) : (
            <Text size="sm" c="dimmed">
              {t("stats.no_data")}
            </Text>
          )}
        </SectionCard>
      </Stack>
    </PageShell>
  );
}
