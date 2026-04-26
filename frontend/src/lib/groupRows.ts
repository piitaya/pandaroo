export interface RowGroup<T> {
  key: string;
  label: string;
  rows: T[];
}

const EMPTY_KEY = "__empty__";

export function groupRows<T>(
  rows: readonly T[],
  getKey: (row: T) => string,
  getLabel: (key: string) => string = (k) => k,
): RowGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const raw = getKey(row);
    const key = raw || EMPTY_KEY;
    const arr = map.get(key);
    if (arr) arr.push(row);
    else map.set(key, [row]);
  }
  const groups: RowGroup<T>[] = [];
  let empty: RowGroup<T> | null = null;
  for (const [key, groupRows] of map) {
    const entry: RowGroup<T> = {
      key,
      label: key === EMPTY_KEY ? "—" : getLabel(key),
      rows: groupRows,
    };
    if (key === EMPTY_KEY) empty = entry;
    else groups.push(entry);
  }
  if (empty) groups.push(empty);
  return groups;
}
