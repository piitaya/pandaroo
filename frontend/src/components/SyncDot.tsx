import { Tooltip } from "@mantine/core";
import { IconCircleFilled } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import type { SyncState } from "../api";
import { syncStatusColor } from "./syncStatusColor";

export function SyncDot({
  sync,
  size = 10,
  tooltip,
}: {
  sync: SyncState;
  size?: number;
  tooltip?: string | null;
}) {
  const { t } = useTranslation();
  const icon = (
    <IconCircleFilled
      size={size}
      style={{ color: syncStatusColor(sync.status), flexShrink: 0 }}
    />
  );
  if (tooltip === null) return icon;
  return (
    <Tooltip label={tooltip ?? t(`slot.sync_status.${sync.status}`)} withArrow>
      {icon}
    </Tooltip>
  );
}
