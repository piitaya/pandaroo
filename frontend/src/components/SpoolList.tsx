import { Fragment } from "react";
import {
  Box,
  Group,
  Progress,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import type { Spool } from "../api";
import type { RowGroup } from "../lib/groupRows";
import { formatGrams } from "../lib/format";
import { ColorSwatch } from "./ColorSwatch";
import { GroupHeader } from "./GroupHeader";
import { spoolHexes, spoolLabels } from "./spoolLabel";
import { remainingGrams } from "./SpoolToolbar";
import { spoolFillColor } from "./spoolFillColor";

interface Props {
  groups: readonly RowGroup<Spool>[];
  onOpen: (tagId: string) => void;
}

export function SpoolList({ groups, onOpen }: Props) {
  const showHeaders = groups.length > 1;
  return (
    <Box role="list">
      {groups.map((group) => (
        <Fragment key={group.key}>
          {showHeaders && (
            <GroupHeader title={group.label} count={group.rows.length} />
          )}
          {group.rows.map((spool) => {
            const labels = spoolLabels(spool);
            return (
              <UnstyledButton
                key={spool.tag_id}
                role="listitem"
                onClick={() => onOpen(spool.tag_id)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "var(--mantine-spacing-sm) var(--mantine-spacing-md)",
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
                      ff={
                        labels.primaryStyle === "code" ? "monospace" : undefined
                      }
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
                    <Stack
                      gap={4}
                      align="flex-end"
                      style={{ width: 84, flexShrink: 0 }}
                    >
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
                    <Text
                      size="xs"
                      c="dimmed"
                      style={{ width: 84, flexShrink: 0, textAlign: "right" }}
                    >
                      —
                    </Text>
                  )}
                </Group>
              </UnstyledButton>
            );
          })}
        </Fragment>
      ))}
    </Box>
  );
}
