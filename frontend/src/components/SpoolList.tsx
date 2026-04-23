import {
  Box,
  Group,
  Progress,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import type { Spool } from "../api";
import { formatGrams } from "../lib/format";
import { ColorSwatch } from "./ColorSwatch";
import { spoolHexes, spoolLabels } from "./spoolLabel";
import { remainingGrams } from "./SpoolToolbar";
import { spoolFillColor } from "./spoolFillColor";

interface Props {
  spools: readonly Spool[];
  onOpen: (tagId: string) => void;
}

export function SpoolList({ spools, onOpen }: Props) {
  return (
    <Box role="list">
      {spools.map((spool) => {
        const labels = spoolLabels(spool);
        return (
        <UnstyledButton
          key={spool.tag_id}
          role="listitem"
          onClick={() => onOpen(spool.tag_id)}
          style={{
            display: "block",
            width: "100%",
            padding:
              "var(--mantine-spacing-sm) var(--mantine-spacing-md)",
            borderBottom: "1px solid var(--mantine-color-default-border)",
          }}
        >
          <Group gap="md" wrap="nowrap" align="center">
            <ColorSwatch hexes={spoolHexes(spool)} size={24} round />
            <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
              <Text
                size="sm"
                fw={500}
                lineClamp={1}
                ff={labels.primaryStyle === "code" ? "monospace" : undefined}
              >
                {labels.primary || "—"}
              </Text>
              {labels.secondary && (
                <Text size="xs" c="dimmed" lineClamp={1}>
                  {labels.secondary}
                </Text>
              )}
            </Stack>
            {spool.remain != null ? (
              <Stack gap={4} align="flex-end" style={{ width: 84, flexShrink: 0 }}>
                <Text size="xs" fw={500}>
                  {formatGrams(remainingGrams(spool))}
                </Text>
                <Progress
                  value={spool.remain}
                  size="xs"
                  color={spoolFillColor(spool.remain)}
                  style={{ width: "100%" }}
                />
              </Stack>
            ) : (
              <Text size="xs" c="dimmed" style={{ width: 84, flexShrink: 0, textAlign: "right" }}>
                —
              </Text>
            )}
          </Group>
        </UnstyledButton>
        );
      })}
    </Box>
  );
}
