import { Badge, Card, Group, Progress, Stack, Text } from "@mantine/core";
import type { Spool } from "../api";
import { formatGrams } from "../lib/format";
import { swatchBackground } from "./ColorSwatch";
import { ResponsiveCardGrid } from "./ResponsiveCardGrid";
import { spoolHexes } from "./spoolLabel";
import { remainingGrams } from "./SpoolToolbar";
import { spoolFillColor } from "./spoolFillColor";

interface Props {
  spools: readonly Spool[];
  onOpen: (tagId: string) => void;
}

export function SpoolGrid({ spools, onOpen }: Props) {
  return (
    <ResponsiveCardGrid>
      {spools.map((spool) => {
        const bandBackground =
          swatchBackground(spoolHexes(spool)) ??
          "var(--mantine-color-gray-2)";
        return (
        <Card
          key={spool.tag_id}
          withBorder
          radius="md"
          padding="xs"
          h="100%"
          onClick={() => onOpen(spool.tag_id)}
          style={{ cursor: "pointer" }}
        >
          <Card.Section>
            <div style={{ height: 64, background: bandBackground }} />
          </Card.Section>
          <Stack gap={4} mt="sm">
            <Text size="sm" fw={500} lineClamp={1}>
              {spool.color_name ?? "—"}
            </Text>
            <Text size="xs" c="dimmed" lineClamp={1}>
              {spool.product ?? "—"}
            </Text>
            <Group justify="space-between" align="center" mt={4} wrap="nowrap">
              <Badge size="xs" variant="light">
                {spool.material ?? "—"}
              </Badge>
              <Text size="xs" c="dimmed">
                {formatGrams(remainingGrams(spool))}
              </Text>
            </Group>
            {spool.remain != null ? (
              <Progress
                value={spool.remain}
                size="sm"
                color={spoolFillColor(spool.remain)}
              />
            ) : null}
          </Stack>
        </Card>
        );
      })}
    </ResponsiveCardGrid>
  );
}
