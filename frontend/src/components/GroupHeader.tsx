import { Group, Text } from "@mantine/core";

interface Props {
  title: string;
  count: number;
}

export function GroupHeader({ title, count }: Props) {
  return (
    <Group
      gap="xs"
      align="baseline"
      wrap="nowrap"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 2,
        background: "var(--mantine-color-body)",
        borderBottom: "1px solid var(--mantine-color-default-border)",
        padding: "var(--mantine-spacing-xs) var(--mantine-spacing-md)",
      }}
    >
      <Text size="sm" fw={600}>
        {title}
      </Text>
      <Text size="xs" c="dimmed">
        ({count})
      </Text>
    </Group>
  );
}
