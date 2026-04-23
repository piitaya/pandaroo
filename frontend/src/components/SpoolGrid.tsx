import { Badge, Card, Group, Progress, SimpleGrid, Stack, Text } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import type { Spool } from "../api";
import { formatGrams } from "../lib/format";
import { remainingGrams } from "./SpoolToolbar";
import { spoolFillColor } from "./spoolFillColor";

interface Props {
  spools: readonly Spool[];
}

export function SpoolGrid({ spools }: Props) {
  const navigate = useNavigate();
  return (
    <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="md">
      {spools.map((spool) => (
        <Card
          key={spool.tag_id}
          withBorder
          radius="md"
          padding="sm"
          onClick={() => navigate(`/inventory/${encodeURIComponent(spool.tag_id)}`)}
          style={{ cursor: "pointer" }}
        >
          <Card.Section>
            <div
              style={{
                height: 72,
                background: spool.color_hex
                  ? `#${spool.color_hex}`
                  : "var(--mantine-color-gray-2)",
              }}
            />
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
      ))}
    </SimpleGrid>
  );
}
