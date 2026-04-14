import { Table, Text } from "@mantine/core";

export function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Table.Tr>
      <Table.Td style={{ verticalAlign: "top" }}>
        <Text size="sm" c="dimmed" truncate>{label}</Text>
      </Table.Td>
      <Table.Td style={{ minWidth: 0 }}>{value}</Table.Td>
    </Table.Tr>
  );
}

export function SectionHeader({ label }: { label: string }) {
  return (
    <Table.Tr>
      <Table.Td
        colSpan={2}
        style={{ paddingTop: 12, paddingBottom: 4, borderBottom: "none" }}
      >
        <Text size="xs" fw={600} tt="uppercase" c="dimmed">{label}</Text>
      </Table.Td>
    </Table.Tr>
  );
}

export function Plain({ children }: { children: React.ReactNode }) {
  return <Text size="sm" truncate>{children}</Text>;
}
