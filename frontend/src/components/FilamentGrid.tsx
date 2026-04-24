import { Badge, Card, Group, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { formatGrams } from "../lib/format";
import { swatchBackground } from "./ColorSwatch";
import type { FilamentRow } from "./FilamentToolbar";
import { ResponsiveCardGrid } from "./ResponsiveCardGrid";
import { spoolHexes } from "./spoolLabel";

interface Props {
  rows: readonly FilamentRow[];
  onOpen: (variantIds: string[]) => void;
}

export function FilamentGrid({ rows, onOpen }: Props) {
  const { t } = useTranslation();
  return (
    <ResponsiveCardGrid>
      {rows.map(({ entry, variantIds, ownership }) => {
        const bandBackground =
          swatchBackground(spoolHexes(entry)) ??
          "var(--mantine-color-gray-2)";
        return (
          <Card
            key={`${entry.sku}::${entry.product}`}
            withBorder
            radius="md"
            padding="xs"
            h="100%"
            onClick={() => onOpen(variantIds)}
            style={{ cursor: "pointer" }}
          >
            <Card.Section>
              <div style={{ height: 64, background: bandBackground }} />
            </Card.Section>
            <Stack gap={2} mt="xs">
              <Text size="sm" fw={500} lineClamp={1}>
                {entry.color_name}
              </Text>
              <Text size="xs" c="dimmed" lineClamp={1}>
                {entry.product}
              </Text>
              <Text size="xs" c="dimmed" ff="monospace" lineClamp={1}>
                {entry.sku}
              </Text>
              <Group
                justify="space-between"
                align="center"
                mt="auto"
                pt={4}
                wrap="nowrap"
              >
                <Badge size="xs" variant="light">
                  {entry.material ?? "—"}
                </Badge>
                {ownership ? (
                  <Group gap={6} wrap="nowrap">
                    {ownership.totalRemaining != null && (
                      <Text size="xs" c="dimmed">
                        {formatGrams(ownership.totalRemaining)}
                      </Text>
                    )}
                    <Badge size="xs" variant="light" color="green">
                      {t("filaments.ownership.n_spools", {
                        count: ownership.spools.length,
                      })}
                    </Badge>
                  </Group>
                ) : (
                  <Text size="xs" c="dimmed">
                    {t("filaments.ownership.not_owned")}
                  </Text>
                )}
              </Group>
            </Stack>
          </Card>
        );
      })}
    </ResponsiveCardGrid>
  );
}
