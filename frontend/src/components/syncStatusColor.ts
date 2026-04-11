import type { SyncStatus } from "../api";

export function syncStatusColor(status: SyncStatus): string {
  switch (status) {
    case "synced":
      return "var(--mantine-color-teal-6)";
    case "stale":
      return "var(--mantine-color-yellow-6)";
    case "error":
      return "var(--mantine-color-red-6)";
    case "never":
      return "var(--mantine-color-gray-5)";
  }
}
