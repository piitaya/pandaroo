import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Card,
  Group,
  Loader,
  Menu,
  Paper,
  Progress,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { DatePickerInput } from "@mantine/dates";
import {
  IconArrowLeft,
  IconCalendar,
  IconDots,
  IconExternalLink,
  IconGauge,
  IconPencil,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AdjustRemainModal } from "../components/AdjustRemainModal";
import { ConfirmModal } from "../components/ConfirmModal";
import { CopyableMono } from "../components/CopyableMono";
import { SpoolRemainChart } from "../components/SpoolRemainChart";
import { SpoolTimeline } from "../components/SpoolTimeline";
import { SyncDot } from "../components/SyncDot";
import { formatAmsLocation } from "../components/formatAmsLocation";
import { useMatchStatus } from "../components/matchStatus";
import { spoolFillColor } from "../components/spoolFillColor";
import {
  useConfig,
  useRemoveSpool,
  useSpoolHistory,
  useSpoolLocation,
  useSpoolMap,
  useSpoolmanBaseUrl,
  useSyncSpoolman,
} from "../hooks";
import type { Spool } from "../api";

type Preset = "7d" | "30d" | "90d" | "all" | "custom";

const PRESET_DAYS: Record<Exclude<Preset, "all" | "custom">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function presetRange(preset: Preset, firstSeen: string): { from: string; to: string } {
  const now = new Date();
  if (preset === "all") {
    return { from: firstSeen, to: now.toISOString() };
  }
  if (preset === "custom") {
    // Should be replaced by the custom value upstream.
    return { from: firstSeen, to: now.toISOString() };
  }
  const days = PRESET_DAYS[preset];
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: now.toISOString() };
}

export default function SpoolDetailPage() {
  const { tagId } = useParams<{ tagId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const matchStatus = useMatchStatus();

  const spoolMap = useSpoolMap();
  const spool: Spool | undefined = tagId ? spoolMap.get(tagId) : undefined;
  const location = useSpoolLocation(tagId ?? "");

  const { data: configData } = useConfig();
  const { data: spoolmanBaseUrl } = useSpoolmanBaseUrl();
  const spoolmanUrl = spoolmanBaseUrl?.replace(/\/+$/, "") ?? null;
  const spoolmanConfigured = Boolean(configData?.spoolman?.url);
  const autoSync = Boolean(configData?.spoolman?.auto_sync);

  const syncSpoolman = useSyncSpoolman();
  const removeSpool = useRemoveSpool();

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const [preset, setPreset] = useState<Preset>("30d");
  const [customRange, setCustomRange] = useState<[Date | null, Date | null]>([
    null,
    null,
  ]);

  const range = useMemo(() => {
    if (preset === "custom" && customRange[0] && customRange[1]) {
      return {
        from: customRange[0].toISOString(),
        to: customRange[1].toISOString(),
      };
    }
    return presetRange(preset, spool?.first_seen ?? new Date().toISOString());
  }, [preset, customRange, spool?.first_seen]);

  const historyQuery = useSpoolHistory(tagId, range);

  if (!tagId) {
    return null;
  }

  if (!spool) {
    // The spools list is fetched on every page; if it's still loading, show a
    // spinner. If it's loaded but the tag id is missing, the spool was deleted
    // or never existed.
    return (
      <Stack gap="lg">
        <BackLink />
        <Loader />
      </Stack>
    );
  }

  const status = matchStatus[spool.match_type];
  const totalWeight =
    spool.weight != null && Number.isFinite(spool.weight) && spool.weight > 0
      ? spool.weight
      : null;
  const hasRemain = spool.remain != null && spool.remain >= 0;
  const remainWeight =
    hasRemain && totalWeight ? Math.round((totalWeight * spool.remain!) / 100) : null;

  const swatches =
    spool.color_hexes && spool.color_hexes.length > 0
      ? spool.color_hexes
      : spool.color_hex
        ? [spool.color_hex]
        : [];

  const title =
    spool.color_name ?? spool.product ?? spool.material ?? spool.tag_id;

  const canManualSync =
    spool.match_type === "mapped" && spoolmanConfigured && !autoSync;

  return (
    <Stack gap="lg">
      <BackLink />

      <Paper p="lg" radius="md" withBorder>
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
          <Group gap="md" wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
            <HeroSwatch hexes={swatches} />
            <Stack gap={4} style={{ minWidth: 0 }}>
              <Title order={2} style={{ overflowWrap: "anywhere" }}>
                {title}
              </Title>
              <Group gap="xs" wrap="wrap">
                <Badge color={status.color} variant="light">
                  {status.label}
                </Badge>
                {spool.material && (
                  <Badge color="gray" variant="light">
                    {spool.material}
                  </Badge>
                )}
                {spoolmanConfigured && spool.match_type === "mapped" && (
                  <Group gap={4} wrap="nowrap">
                    <SyncDot sync={spool.sync} />
                    <Text size="xs" c="dimmed">
                      {t(`slot.sync_status.${spool.sync.status}`)}
                    </Text>
                  </Group>
                )}
              </Group>
            </Stack>
          </Group>
          <Group gap="xs" wrap="nowrap">
            {canManualSync && (
              <Tooltip label={t("slot.sync_aria_label")} withArrow>
                <ActionIcon
                  variant="default"
                  size="lg"
                  loading={syncSpoolman.isPending}
                  onClick={() => syncSpoolman.mutate([spool.tag_id])}
                  aria-label={t("slot.sync_aria_label")}
                >
                  <IconRefresh size={18} />
                </ActionIcon>
              </Tooltip>
            )}
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <ActionIcon variant="default" size="lg">
                  <IconDots size={18} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconGauge size={14} />}
                  onClick={() => setAdjustOpen(true)}
                >
                  {t("spools.adjust_remain")}
                </Menu.Item>
                {spool.match_type === "mapped" &&
                  spoolmanUrl &&
                  (spool.sync.status === "synced" || spool.sync.status === "stale") && (
                    <Menu.Item
                      leftSection={<IconExternalLink size={14} />}
                      component="a"
                      href={`${spoolmanUrl}/spool/show/${spool.sync.spoolman_spool_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("slot.sync_status.open_in_spoolman")}
                    </Menu.Item>
                  )}
                <Menu.Item
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  onClick={() => setConfirmRemove(true)}
                >
                  {t("common.remove")}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </Paper>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        <StatCard label={t("slot.fields.remaining")}>
          {hasRemain ? (
            <Stack gap={6}>
              <Group justify="space-between" align="baseline">
                <Text size="xl" fw={700}>
                  {spool.remain}%
                </Text>
                {remainWeight != null && (
                  <Text size="sm" c="dimmed">
                    {remainWeight} / {totalWeight} g
                  </Text>
                )}
              </Group>
              <Progress
                value={spool.remain!}
                size="sm"
                color={spoolFillColor(spool.remain!)}
              />
            </Stack>
          ) : (
            <Group gap="xs">
              <Text c="dimmed">—</Text>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                onClick={() => setAdjustOpen(true)}
                aria-label={t("spools.adjust_remain")}
              >
                <IconPencil size={14} />
              </ActionIcon>
            </Group>
          )}
        </StatCard>

        <StatCard label={t("slot.fields.current_location")}>
          {location ? (
            <Text size="md" fw={500}>
              {formatAmsLocation(location, t)}
            </Text>
          ) : (
            <Text c="dimmed">{t("spool_detail.location.not_loaded")}</Text>
          )}
        </StatCard>

        <StatCard label={t("slot.fields.nozzle_temp")}>
          {spool.temp_min != null || spool.temp_max != null ? (
            <Text size="md" fw={500}>
              {spool.temp_min ?? "—"} – {spool.temp_max ?? "—"} °C
            </Text>
          ) : (
            <Text c="dimmed">—</Text>
          )}
        </StatCard>

        <StatCard label={t("slot.fields.last_used")}>
          {spool.last_used ? (
            <Text size="md" fw={500}>
              {new Date(spool.last_used).toLocaleString()}
            </Text>
          ) : (
            <Text c="dimmed">—</Text>
          )}
        </StatCard>
      </SimpleGrid>

      <MainWithSide
        mainTabLabel={t("spool_detail.tabs.info")}
        sideTabLabel={t("spool_detail.tabs.activity")}
        main={(
          <>
            <Card withBorder padding="lg" radius="md">
              <Stack gap="md">
                <Group justify="space-between" align="center" wrap="wrap">
                  <Title order={4}>{t("spool_detail.chart.title")}</Title>
                  <Group gap="sm" wrap="wrap">
                    <SegmentedControl
                      size="xs"
                      value={preset}
                      onChange={(value) => setPreset(value as Preset)}
                      data={[
                        { value: "7d", label: t("spool_detail.range.7d") },
                        { value: "30d", label: t("spool_detail.range.30d") },
                        { value: "90d", label: t("spool_detail.range.90d") },
                        { value: "all", label: t("spool_detail.range.all") },
                        { value: "custom", label: t("spool_detail.range.custom") },
                      ]}
                    />
                    {preset === "custom" && (
                      <DatePickerInput
                        type="range"
                        size="xs"
                        value={customRange}
                        onChange={(value) =>
                          setCustomRange(value as [Date | null, Date | null])
                        }
                        leftSection={<IconCalendar size={14} />}
                        placeholder={t("spool_detail.range.custom_placeholder")}
                        clearable={false}
                        miw={240}
                      />
                    )}
                  </Group>
                </Group>
                <SpoolRemainChart
                  events={historyQuery.data?.events}
                  range={range}
                  currentRemain={spool.remain}
                  loading={historyQuery.isLoading}
                />
              </Stack>
            </Card>

            <Card withBorder padding="lg" radius="md">
              <Stack gap="sm">
                <Title order={4}>{t("spool_detail.details.title")}</Title>
                <DetailRow label={t("slot.fields.spool_uid")}>
                  <CopyableMono value={spool.tag_id} />
                </DetailRow>
                {spool.variant_id && (
                  <DetailRow label={t("slot.fields.bambu_filament")}>
                    <CopyableMono value={spool.variant_id} />
                  </DetailRow>
                )}
                {totalWeight != null && (
                  <DetailRow label={t("slot.fields.total_weight")}>
                    <Text size="sm">{totalWeight} g</Text>
                  </DetailRow>
                )}
                {swatches.length > 0 && (
                  <DetailRow
                    label={t(
                      swatches.length > 1
                        ? "slot.fields.colors_hex"
                        : "slot.fields.color_hex",
                    )}
                  >
                    <CopyableMono value={swatches.join(", ")} />
                  </DetailRow>
                )}
                <DetailRow label={t("slot.fields.first_seen")}>
                  <Text size="sm">
                    {new Date(spool.first_seen).toLocaleString()}
                  </Text>
                </DetailRow>
                <DetailRow label={t("slot.fields.last_updated")}>
                  <Text size="sm">
                    {new Date(spool.last_updated).toLocaleString()}
                  </Text>
                </DetailRow>
                {spool.match_type === "mapped" &&
                  (spool.sync.status === "synced" ||
                    spool.sync.status === "stale") && (
                    <DetailRow label={t("slot.fields.spoolman_spool")}>
                      <Group gap={4} wrap="nowrap">
                        <Text size="sm">#{spool.sync.spoolman_spool_id}</Text>
                        {spoolmanUrl && (
                          <Tooltip
                            label={t("slot.sync_status.open_in_spoolman")}
                            withArrow
                          >
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color="gray"
                              component="a"
                              href={`${spoolmanUrl}/spool/show/${spool.sync.spoolman_spool_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <IconExternalLink size={14} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </Group>
                    </DetailRow>
                  )}
                {spool.match_type === "mapped" &&
                  spool.sync.status === "error" && (
                    <DetailRow label={t("slot.fields.sync_error")}>
                      <Text size="sm" c="red">
                        {spool.sync.error}
                      </Text>
                    </DetailRow>
                  )}
              </Stack>
            </Card>
          </>
        )}
        side={(
          <Card
            withBorder
            padding="lg"
            radius="md"
            style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
          >
            <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
              <Title order={4}>{t("spool_detail.timeline.title")}</Title>
              {historyQuery.isLoading ? (
                <Loader size="sm" />
              ) : (
                <ScrollArea type="auto" offsetScrollbars style={{ flex: 1, minHeight: 0 }}>
                  <SpoolTimeline events={historyQuery.data?.events} />
                </ScrollArea>
              )}
              {historyQuery.data?.has_more && (
                <Alert variant="light" color="gray">
                  {t("spool_detail.timeline.has_more")}
                </Alert>
              )}
            </Stack>
          </Card>
        )}
      />

      <AdjustRemainModal
        key={spool.tag_id}
        spool={spool}
        opened={adjustOpen}
        onClose={() => setAdjustOpen(false)}
      />

      <ConfirmModal
        opened={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => {
          removeSpool.mutate(spool.tag_id, {
            onSuccess: () => navigate("/inventory"),
            onSettled: () => setConfirmRemove(false),
          });
        }}
        title={t("spools.remove_confirm_title")}
        body={t("spools.remove_confirm_body", { name: title })}
        loading={removeSpool.isPending}
      />
    </Stack>
  );
}

interface MainWithSideProps {
  main: ReactNode;
  side: ReactNode;
  mainTabLabel: string;
  sideTabLabel: string;
}

function MainWithSide({ main, side, mainTabLabel, sideTabLabel }: MainWithSideProps) {
  const isDesktop = useMediaQuery("(min-width: 48em)", true, { getInitialValueInEffect: false });

  if (isDesktop) {
    return (
      <Box
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "var(--mantine-spacing-md)",
          alignItems: "stretch",
        }}
      >
        <Stack gap="lg">{main}</Stack>
        <Box style={{ position: "relative" }}>
          <Box style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
            {side}
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Tabs defaultValue="main" variant="outline">
      <Tabs.List>
        <Tabs.Tab value="main">{mainTabLabel}</Tabs.Tab>
        <Tabs.Tab value="side">{sideTabLabel}</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="main" pt="md">
        <Stack gap="lg">{main}</Stack>
      </Tabs.Panel>
      <Tabs.Panel value="side" pt="md">
        {side}
      </Tabs.Panel>
    </Tabs>
  );
}

function BackLink() {
  const { t } = useTranslation();
  return (
    <Anchor component={Link} to="/inventory" size="sm" c="dimmed">
      <Group gap={4} wrap="nowrap">
        <IconArrowLeft size={14} />
        {t("spool_detail.back")}
      </Group>
    </Anchor>
  );
}

function HeroSwatch({ hexes }: { hexes: string[] }) {
  const valid = hexes.filter((h) => h && h !== "00000000");
  if (valid.length === 0) {
    return (
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 12,
          border: "1px solid var(--mantine-color-default-border)",
          flexShrink: 0,
        }}
      />
    );
  }
  const background =
    valid.length === 1
      ? `#${valid[0].slice(0, 6)}`
      : `linear-gradient(135deg, ${valid
          .map((h, i) => `#${h.slice(0, 6)} ${(i * 100) / valid.length}% ${((i + 1) * 100) / valid.length}%`)
          .join(", ")})`;
  return (
    <div
      style={{
        width: 56,
        height: 56,
        borderRadius: 12,
        border: "1px solid var(--mantine-color-default-border)",
        background,
        flexShrink: 0,
      }}
    />
  );
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap={6}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          {label}
        </Text>
        {children}
      </Stack>
    </Card>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Group justify="space-between" gap="md" wrap="nowrap" align="center">
      <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <div style={{ minWidth: 0, maxWidth: "60%" }}>{children}</div>
    </Group>
  );
}

