import { Badge, Box, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { formatGrams } from "../lib/format";
import { ColorSwatch } from "./ColorSwatch";
import type { FilamentRow } from "./FilamentToolbar";
import { spoolHexes } from "./spoolLabel";

interface Props {
  rows: readonly FilamentRow[];
  onOpen: (variantIds: string[]) => void;
}

export function FilamentList({ rows, onOpen }: Props) {
  const { t } = useTranslation();
  return (
    <Box role="list">
      {rows.map(({ entry, variantIds, ownership }) => (
        <UnstyledButton
          key={`${entry.sku}::${entry.product}`}
          role="listitem"
          onClick={() => onOpen(variantIds)}
          style={{
            display: "block",
            width: "100%",
            padding: "var(--mantine-spacing-sm) var(--mantine-spacing-md)",
            borderBottom: "1px solid var(--mantine-color-default-border)",
          }}
        >
          <Group gap="md" wrap="nowrap" align="center">
            <ColorSwatch hexes={spoolHexes(entry)} size={24} round />
            <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={500} lineClamp={1}>
                {entry.color_name}
              </Text>
              <Text size="xs" c="dimmed" lineClamp={1}>
                {[entry.material, entry.product]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              <Text size="xs" c="dimmed" ff="monospace" lineClamp={1}>
                {entry.sku}
              </Text>
            </Stack>
            <Stack
              gap={2}
              align="flex-end"
              style={{ width: 96, flexShrink: 0 }}
            >
              {ownership ? (
                <>
                  <Badge size="xs" variant="light" color="green">
                    {t("filaments.ownership.n_spools", {
                      count: ownership.spools.length,
                    })}
                  </Badge>
                  {ownership.totalRemaining != null && (
                    <Text size="xs" c="dimmed">
                      {formatGrams(ownership.totalRemaining)}
                    </Text>
                  )}
                </>
              ) : (
                <Text size="xs" c="dimmed">
                  {t("filaments.ownership.not_owned")}
                </Text>
              )}
            </Stack>
          </Group>
          </UnstyledButton>
        ))}
    </Box>
  );
}
