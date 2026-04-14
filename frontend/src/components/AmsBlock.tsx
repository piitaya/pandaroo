import { Badge, Group, SimpleGrid, Stack, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { amsLabel } from "./amsLabel";
import { AmsSlotCard, amsSlotKey } from "./AmsSlotCard";
import type { AmsUnit } from "../api";

function NozzleBadge({ nozzleId }: { nozzleId: number | null }) {
  const { t } = useTranslation();
  if (nozzleId == null) return null;
  const label =
    nozzleId === 1 ? t("common.left_nozzle") : t("common.right_nozzle");
  const color = nozzleId === 1 ? "grape" : "blue";
  return (
    <Badge size="sm" color={color} variant="light">
      {label}
    </Badge>
  );
}

export function AmsBlock({ ams }: { ams: AmsUnit }) {
  return (
    <Stack gap="xs">
      <Group gap="xs" align="center">
        <Title order={5} c="dimmed" tt="uppercase" fz="xs">
          {amsLabel(ams.id)}
        </Title>
        <NozzleBadge nozzleId={ams.nozzle_id} />
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        {ams.slots.map((s) => (
          <AmsSlotCard key={amsSlotKey(s)} s={s} />
        ))}
      </SimpleGrid>
    </Stack>
  );
}
