import { AppShell, Burger, Group, NavLink, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useLocation } from "react-router-dom";
import { ErrorBoundary } from "./ErrorBoundary";
import {
  IconDashboard,
  IconPrinter,
  IconRefresh,
  IconSettings,
  IconCylinder
} from "@tabler/icons-react";

export default function Layout() {
  const location = useLocation();
  const { t } = useTranslation();
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] =
    useDisclosure(false);

  useEffect(() => {
    closeMobile();
  }, [location.pathname, closeMobile]);

  const links = [
    { to: "/", label: t("nav.dashboard"), icon: IconDashboard },
    { to: "/printers", label: t("nav.printers"), icon: IconPrinter },
    { to: "/spools", label: t("nav.spools"), icon: IconCylinder },
    { to: "/sync", label: t("nav.sync"), icon: IconRefresh },
    { to: "/settings", label: t("nav.settings"), icon: IconSettings }
  ];

  return (
    <AppShell
      padding="md"
      header={{ height: 56 }}
      navbar={{
        width: 240,
        breakpoint: "sm",
        collapsed: { mobile: !mobileOpened }
      }}
    >
      <AppShell.Header p="sm">
        <Group h="100%" gap="sm">
          <Burger
            opened={mobileOpened}
            onClick={toggleMobile}
            hiddenFrom="sm"
            size="sm"
            aria-label={t("nav.toggle_navigation")}
          />
          <Title order={4}>Bambu Spoolman Sync</Title>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="sm">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            component={Link}
            to={to}
            label={label}
            leftSection={<Icon size={18} stroke={1.5} />}
            active={location.pathname === to}
          />
        ))}
      </AppShell.Navbar>
      <AppShell.Main>
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </AppShell.Main>
    </AppShell>
  );
}
