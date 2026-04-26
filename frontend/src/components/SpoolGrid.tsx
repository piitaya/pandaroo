import { Badge, Card, Group, Progress, Stack, Text } from "@mantine/core";
import type { Spool } from "../api";
import type { RowGroup } from "../lib/groupRows";
import { formatGrams } from "../lib/format";
import { swatchBackground } from "./ColorSwatch";
import { GroupHeader } from "./GroupHeader";
import { ResponsiveCardGrid } from "./ResponsiveCardGrid";
import { spoolHexes } from "./spoolLabel";
import { remainingGrams } from "./SpoolToolbar";
import { spoolFillColor } from "./spoolFillColor";

interface Props {
  groups: readonly RowGroup<Spool>[];
  onOpen: (tagId: string) => void;
}

export function SpoolGrid({ groups, onOpen }: Props) {
  const showHeaders = groups.length > 1;
  return (
    <div>
      {groups.map((group) => (
        <section key={group.key}>
          {showHeaders && (
            <GroupHeader title={group.label} count={group.rows.length} />
          )}
          <div style={{ padding: "var(--mantine-spacing-md)" }}>
            <ResponsiveCardGrid>
            {group.rows.map((spool) => {
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
                    <Group
                      justify="space-between"
                      align="center"
                      mt={4}
                      wrap="nowrap"
                    >
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
          </div>
        </section>
      ))}
    </div>
  );
}
