import {
  Badge,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Title,
  Tooltip,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { amsLabel } from "./amsLabel";
import { AmsSlotCard, amsSlotKey } from "./AmsSlotCard";
import type { AmsUnit } from "../api";

function NozzleBadge({ nozzleId }: { nozzleId: number | null }) {
  const { t } = useTranslation();
  if (nozzleId == null) return null;
  const isLeft = nozzleId === 1;
  const label = isLeft
    ? t("common.left_nozzle")
    : t("common.right_nozzle");
  const shortLabel = isLeft
    ? t("common.left_nozzle_short")
    : t("common.right_nozzle_short");
  const color = isLeft ? "grape" : "blue";
  return (
    <Tooltip label={label} withArrow>
      <Badge size="sm" color={color} variant="light" style={{ flexShrink: 0 }}>
        {shortLabel}
      </Badge>
    </Tooltip>
  );
}

export function AmsBlock({
  ams,
  showNozzle = true,
}: {
  ams: AmsUnit;
  showNozzle?: boolean;
}) {
  const header = (
    <Group gap="xs" align="center" justify="space-between" wrap="nowrap">
      <Title order={5} c="dimmed" tt="uppercase" fz="xs" style={{ minWidth: 0 }} truncate>
        {amsLabel(ams.id)}
      </Title>
      {showNozzle && <NozzleBadge nozzleId={ams.nozzle_id} />}
    </Group>
  );

  return (
    <Card
      withBorder
      radius="md"
      padding={8}
      bg="var(--mantine-color-default-hover)"
    >
      <Stack gap={8}>
        {header}
        <SimpleGrid
          cols={{
            base: Math.min(ams.slots.length, 2),
            sm: ams.slots.length,
          }}
          spacing={8}
        >
          {ams.slots.map((s) => (
            <AmsSlotCard key={amsSlotKey(s)} s={s} />
          ))}
        </SimpleGrid>
      </Stack>
    </Card>
  );
}
