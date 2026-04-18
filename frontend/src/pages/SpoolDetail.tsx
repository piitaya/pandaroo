import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Card,
  Group,
  Loader,
  Menu,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconDots,
  IconExternalLink,
  IconGauge,
  IconPencil,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AdjustRemainModal } from "../components/AdjustRemainModal";
import { ConfirmModal } from "../components/ConfirmModal";
import { CopyableMono } from "../components/CopyableMono";
import { SpoolIllustration } from "../components/SpoolIllustration";
import { SpoolUsageHistory } from "../components/SpoolUsageHistory";
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

  const historyQuery = useSpoolHistory(tagId);

  if (!tagId) {
    return null;
  }

  if (!spool) {
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

  const swatches =
    spool.color_hexes && spool.color_hexes.length > 0
      ? spool.color_hexes
      : spool.color_hex
        ? [spool.color_hex]
        : [];
  const heroHex = swatches[0] ?? null;

  const title =
    spool.color_name ?? spool.product ?? spool.material ?? spool.tag_id;

  const canManualSync =
    spool.match_type === "mapped" && spoolmanConfigured && !autoSync;

  return (
    <Stack gap="lg">
      <BackLink />

      <Paper p="lg" radius="md" withBorder>
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
            <Group
              gap="lg"
              wrap="wrap"
              align="center"
              style={{ flex: 1, minWidth: 0, rowGap: "var(--mantine-spacing-md)" }}
            >
              <SpoolIllustration
                hex={heroHex}
                remain={spool.remain}
                size={120}
              />
              <Stack gap={6} style={{ minWidth: 0, flex: "1 1 220px" }}>
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
                <Title order={2} style={{ overflowWrap: "anywhere" }}>
                  {title}
                </Title>
                {spool.product && (
                  <Text size="sm" c="dimmed">
                    {spool.product}
                  </Text>
                )}
                <HeroRemain
                  spool={spool}
                  totalWeight={totalWeight}
                  onAdjust={() => setAdjustOpen(true)}
                />
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
                    (spool.sync.status === "synced" ||
                      spool.sync.status === "stale") && (
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
                  <Menu.Divider />
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
        </Stack>
      </Paper>

      <Card withBorder padding="lg" radius="md">
        <Stack gap="sm">
          <DetailRow label={t("slot.fields.current_location")}>
            {location ? (
              <Text size="sm" fw={500}>
                {formatAmsLocation(location, t)}
              </Text>
            ) : (
              <Text size="sm" c="dimmed">
                {t("spool_detail.location.not_loaded")}
              </Text>
            )}
          </DetailRow>
          <DetailRow label={t("slot.fields.last_used")}>
            <Text size="sm">
              {spool.last_used
                ? new Date(spool.last_used).toLocaleString()
                : "—"}
            </Text>
          </DetailRow>
          <DetailRow label={t("slot.fields.nozzle_temp")}>
            {spool.temp_min != null || spool.temp_max != null ? (
              <Text size="sm">
                {spool.temp_min ?? "—"} – {spool.temp_max ?? "—"} °C
              </Text>
            ) : (
              <Text size="sm" c="dimmed">
                —
              </Text>
            )}
          </DetailRow>
        </Stack>
      </Card>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" verticalSpacing="lg">
        <Card withBorder padding="lg" radius="md">
          {historyQuery.isLoading ? (
            <Loader size="sm" />
          ) : (
            <SpoolUsageHistory events={historyQuery.data?.events} />
          )}
          {historyQuery.data?.has_more && (
            <Alert variant="light" color="gray" mt="md">
              {t("spool_detail.usage.has_more")}
            </Alert>
          )}
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
            <Text size="sm">{new Date(spool.first_seen).toLocaleString()}</Text>
          </DetailRow>
          <DetailRow label={t("slot.fields.last_updated")}>
            <Text size="sm">
              {new Date(spool.last_updated).toLocaleString()}
            </Text>
          </DetailRow>
          {spool.match_type === "mapped" &&
            (spool.sync.status === "synced" || spool.sync.status === "stale") && (
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
            {spool.match_type === "mapped" && spool.sync.status === "error" && (
              <DetailRow label={t("slot.fields.sync_error")}>
                <Text size="sm" c="red">
                  {spool.sync.error}
                </Text>
              </DetailRow>
            )}
          </Stack>
        </Card>
      </SimpleGrid>

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

interface HeroRemainProps {
  spool: Spool;
  totalWeight: number | null;
  onAdjust: () => void;
}

function HeroRemain({ spool, totalWeight, onAdjust }: HeroRemainProps) {
  const { t } = useTranslation();
  if (spool.remain == null || spool.remain < 0) {
    return (
      <Group gap="xs" mt={4}>
        <Text size="sm" c="dimmed">
          {t("spool_detail.remain.no_data")}
        </Text>
        <ActionIcon
          size="sm"
          variant="subtle"
          color="gray"
          onClick={onAdjust}
          aria-label={t("spools.adjust_remain")}
        >
          <IconPencil size={14} />
        </ActionIcon>
      </Group>
    );
  }
  const remainWeight =
    totalWeight != null ? Math.round((totalWeight * spool.remain) / 100) : null;
  return (
    <Stack gap={6} mt={4} maw={360}>
      <Group justify="space-between" align="baseline">
        <Text size="xl" fw={700}>
          {spool.remain}%
        </Text>
        {remainWeight != null && totalWeight != null && (
          <Text size="sm" c="dimmed" ff="monospace">
            {remainWeight} / {totalWeight} g
          </Text>
        )}
      </Group>
      <Progress value={spool.remain} size="sm" color={spoolFillColor(spool.remain)} />
    </Stack>
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

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Group justify="space-between" gap="md" wrap="nowrap" align="center">
      <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <div style={{ minWidth: 0, maxWidth: "60%", textAlign: "right" }}>{children}</div>
    </Group>
  );
}
