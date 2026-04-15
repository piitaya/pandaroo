import { AppShell, Group, NavLink, Title } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useLocation } from "react-router-dom";
import {
  IconBroadcast,
  IconCylinder,
  IconSettings
} from "@tabler/icons-react";
import { ErrorBoundary } from "./ErrorBoundary";
import BottomBar, { BOTTOM_BAR_HEIGHT, type NavItem } from "./BottomBar";

export default function Layout() {
  const location = useLocation();
  const { t } = useTranslation();
  const isMobile = useMediaQuery("(max-width: 48em)") ?? false;

  const links: NavItem[] = [
    { to: "/live", label: t("nav.live"), icon: IconBroadcast },
    { to: "/inventory", label: t("nav.inventory"), icon: IconCylinder },
    { to: "/settings", label: t("nav.settings"), icon: IconSettings }
  ];

  const isActive = (to: string) =>
    to === "/live"
      ? location.pathname === "/live" || location.pathname === "/"
      : location.pathname === to || location.pathname.startsWith(`${to}/`);

  return (
    <AppShell
      padding="md"
      header={{ height: 56 }}
      navbar={{
        width: 240,
        breakpoint: "sm",
        collapsed: { mobile: true }
      }}
      footer={{
        height: BOTTOM_BAR_HEIGHT,
        collapsed: !isMobile
      }}
    >
      <AppShell.Header p="sm">
        <Group h="100%" gap="sm">
          <Title order={4}>Bambu Spoolman Sync</Title>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="sm" visibleFrom="sm">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            component={Link}
            to={to}
            label={label}
            leftSection={<Icon size={18} stroke={1.5} />}
            active={isActive(to)}
          />
        ))}
      </AppShell.Navbar>
      <AppShell.Footer>
        <BottomBar items={links} isActive={isActive} />
      </AppShell.Footer>
      <AppShell.Main>
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </AppShell.Main>
    </AppShell>
  );
}
