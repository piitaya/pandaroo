import {
  ActionIcon,
  Box,
  Button,
  Group,
  Title,
  Tooltip,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useLocation } from "react-router-dom";
import {
  IconBroadcast,
  IconCylinder,
  IconSettings,
} from "@tabler/icons-react";
import { ErrorBoundary } from "./ErrorBoundary";
import BottomBar, { BOTTOM_BAR_HEIGHT, type NavItem } from "./BottomBar";

const HEADER_HEIGHT = 56;

export default function Layout() {
  const location = useLocation();
  const { t } = useTranslation();
  const isMobile = useMediaQuery("(max-width: 48em)") ?? false;

  const primaryLinks: NavItem[] = [
    { to: "/live", label: t("nav.live"), icon: IconBroadcast },
    { to: "/inventory", label: t("nav.inventory"), icon: IconCylinder },
  ];
  const settingsLink: NavItem = {
    to: "/settings",
    label: t("nav.settings"),
    icon: IconSettings,
  };
  const mobileLinks = [...primaryLinks, settingsLink];

  const isActive = (to: string) =>
    to === "/live"
      ? location.pathname === "/live" || location.pathname === "/"
      : location.pathname === to || location.pathname.startsWith(`${to}/`);

  return (
    <Box style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
      <Box
        component="header"
        p="sm"
        style={{
          flexShrink: 0,
          height: HEADER_HEIGHT,
          borderBottom: "1px solid var(--mantine-color-default-border)",
          background: "var(--mantine-color-body)",
        }}
      >
        <Group h="100%" gap="sm" wrap="nowrap" justify="space-between">
          <Group gap="xl" wrap="nowrap">
            <Title order={4}>Pandaroo</Title>
            <Group gap={4} wrap="nowrap" visibleFrom="sm">
              {primaryLinks.map(({ to, label, icon: Icon }) => (
                <Button
                  key={to}
                  component={Link}
                  to={to}
                  variant={isActive(to) ? "light" : "subtle"}
                  color={isActive(to) ? undefined : "gray"}
                  leftSection={<Icon size={16} stroke={1.5} />}
                  size="sm"
                >
                  {label}
                </Button>
              ))}
            </Group>
          </Group>
          <Tooltip label={settingsLink.label}>
            <ActionIcon
              component={Link}
              to={settingsLink.to}
              variant={isActive(settingsLink.to) ? "light" : "subtle"}
              color={isActive(settingsLink.to) ? undefined : "gray"}
              size="lg"
              aria-label={settingsLink.label}
              visibleFrom="sm"
            >
              <settingsLink.icon size={18} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Box>
      <Box component="main" style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </Box>
      {isMobile && (
        <Box
          component="footer"
          style={{
            flexShrink: 0,
            height: BOTTOM_BAR_HEIGHT,
            borderTop: "1px solid var(--mantine-color-default-border)",
            background: "var(--mantine-color-body)",
          }}
        >
          <BottomBar items={mobileLinks} isActive={isActive} />
        </Box>
      )}
    </Box>
  );
}
