import { ActionIcon, CopyButton, Group, Text, Tooltip } from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

export function CopyableMono({ value }: { value: string }) {
  const { t } = useTranslation();
  return (
    <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
      <Text ff="monospace" size="sm" truncate style={{ flex: 1, minWidth: 0 }}>
        {value}
      </Text>
      <CopyButton value={value} timeout={1500}>
        {({ copied, copy }) => (
          <Tooltip
            label={copied ? t("common.copied") : t("common.copy")}
            withArrow
            position="left"
          >
            <ActionIcon
              size="sm"
              variant="subtle"
              color={copied ? "teal" : "gray"}
              onClick={copy}
              aria-label={t("common.copy")}
            >
              {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  );
}
