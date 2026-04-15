import { Group, Stack, Text, UnstyledButton } from "@mantine/core";
import type { Icon } from "@tabler/icons-react";
import { Link } from "react-router-dom";

export const BOTTOM_BAR_HEIGHT = 64;

export interface NavItem {
  to: string;
  label: string;
  icon: Icon;
}

interface BottomBarProps {
  items: NavItem[];
  isActive: (to: string) => boolean;
}

export default function BottomBar({ items, isActive }: BottomBarProps) {
  return (
    <Group
      component="nav"
      h="100%"
      gap={0}
      grow
      preventGrowOverflow={false}
      align="stretch"
    >
      {items.map(({ to, label, icon: Icon }) => {
        const active = isActive(to);
        return (
          <UnstyledButton
            key={to}
            component={Link}
            to={to}
            aria-current={active ? "page" : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: active
                ? "var(--mantine-primary-color-filled)"
                : "var(--mantine-color-dimmed)"
            }}
          >
            <Stack gap={2} align="center" justify="center">
              <Icon size={22} stroke={active ? 2 : 1.5} />
              <Text size="xs" fw={active ? 600 : 400} c="inherit">
                {label}
              </Text>
            </Stack>
          </UnstyledButton>
        );
      })}
    </Group>
  );
}
