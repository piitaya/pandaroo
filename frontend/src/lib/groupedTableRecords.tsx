import { Table, Text, type TableTrProps } from "@mantine/core";
import type { ReactNode } from "react";
import type { RowGroup } from "./groupRows";

const COLUMN_HEADER_OFFSET_PX = 36;

export interface GroupHeaderRow {
  __groupHeader: true;
  key: string;
  label: string;
  count: number;
}

export type WithGroupHeader<T> = T | GroupHeaderRow;

export function isGroupHeaderRow(r: unknown): r is GroupHeaderRow {
  return (
    typeof r === "object" &&
    r !== null &&
    (r as GroupHeaderRow).__groupHeader === true
  );
}

export function buildTableRecords<T>(
  groups: readonly RowGroup<T>[],
): WithGroupHeader<T>[] {
  if (groups.length <= 1) return [...(groups[0]?.rows ?? [])];
  const out: WithGroupHeader<T>[] = [];
  for (const g of groups) {
    out.push({
      __groupHeader: true,
      key: g.key,
      label: g.label,
      count: g.rows.length,
    });
    out.push(...g.rows);
  }
  return out;
}

export function dataCell<T>(
  render: (r: T) => ReactNode,
): (r: WithGroupHeader<T>) => ReactNode {
  return (r) => (isGroupHeaderRow(r) ? null : render(r));
}

interface RowFactoryArgs<T> {
  record: T;
  index: number;
  children: ReactNode;
  rowProps: TableTrProps;
  expandedElement?: ReactNode;
}

export function makeGroupRowFactory<T>(colSpan: number) {
  return ({ record, children, rowProps }: RowFactoryArgs<WithGroupHeader<T>>) => {
    if (isGroupHeaderRow(record)) {
      return (
        <Table.Tr {...rowProps} style={{ cursor: "default" }}>
          <Table.Td
            colSpan={colSpan}
            style={{
              position: "sticky",
              top: COLUMN_HEADER_OFFSET_PX,
              zIndex: 1,
              background: "var(--mantine-color-default-hover)",
              padding:
                "var(--mantine-spacing-xs) var(--mantine-spacing-md)",
              borderBottom:
                "1px solid var(--mantine-color-default-border)",
            }}
          >
            <Text size="sm" fw={600} component="span">
              {record.label}
            </Text>
            <Text size="xs" c="dimmed" component="span" ml={6}>
              ({record.count})
            </Text>
          </Table.Td>
        </Table.Tr>
      );
    }
    return <Table.Tr {...rowProps}>{children}</Table.Tr>;
  };
}
