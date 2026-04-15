import { Stack, Tabs } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

const TAB_BY_PATH: Record<string, string> = {
  "/settings": "general",
  "/settings/printers": "printers",
  "/settings/sync": "sync"
};

const PATH_BY_TAB: Record<string, string> = {
  general: "/settings",
  printers: "/settings/printers",
  sync: "/settings/sync"
};

export default function SettingsLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const current = TAB_BY_PATH[location.pathname] ?? "general";

  return (
    <Stack gap="lg">
      <Tabs
        value={current}
        onChange={(value) => {
          if (value && PATH_BY_TAB[value]) navigate(PATH_BY_TAB[value]);
        }}
      >
        <Tabs.List>
          <Tabs.Tab value="general">{t("settings.tabs.general")}</Tabs.Tab>
          <Tabs.Tab value="printers">{t("settings.tabs.printers")}</Tabs.Tab>
          <Tabs.Tab value="sync">{t("settings.tabs.sync")}</Tabs.Tab>
        </Tabs.List>
      </Tabs>
      <Outlet />
    </Stack>
  );
}
