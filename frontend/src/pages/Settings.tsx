import {
  Button,
  Card,
  Group,
  Select,
  Stack,
  Text,
  Title,
  useMantineColorScheme
} from "@mantine/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CATALOG_REPO } from "@pandaroo/shared";
import { useFilamentCatalog, useRefreshMapping } from "../hooks";
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  persistLanguage,
  type Language
} from "../i18n";

export default function SettingsPage() {
  const { data: catalog } = useFilamentCatalog();
  const refresh = useRefreshMapping();
  const { t, i18n } = useTranslation();
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  const fetchedAt = catalog?.fetched_at
    ? new Date(catalog.fetched_at).toLocaleString()
    : t("settings.mapping_card.never");

  const languageOptions = useMemo(
    () =>
      Object.entries(LANGUAGES).map(([value, info]) => ({
        value,
        label: info.label
      })),
    []
  );

  const onLanguageChange = (value: string | null) => {
    if (!value || !(value in LANGUAGES)) return;
    const lang = value as Language;
    i18n.changeLanguage(lang);
    persistLanguage(lang);
  };

  const onThemeChange = (value: string | null) => {
    if (value === "light" || value === "dark" || value === "auto") {
      setColorScheme(value);
    }
  };

  return (
    <Stack gap="lg" maw={640}>
      <Title order={2}>{t("settings.title")}</Title>

      <Card withBorder padding="lg" radius="md">
        <Stack gap="md">
          <Title order={4}>{t("settings.appearance_card.title")}</Title>
          <Select
            label={t("settings.appearance_card.language")}
            value={i18n.language in LANGUAGES ? i18n.language : DEFAULT_LANGUAGE}
            onChange={onLanguageChange}
            data={languageOptions}
            allowDeselect={false}
          />
          <Select
            label={t("settings.appearance_card.theme")}
            value={colorScheme}
            onChange={onThemeChange}
            data={[
              { value: "auto", label: t("settings.appearance_card.theme_auto") },
              { value: "light", label: t("settings.appearance_card.theme_light") },
              { value: "dark", label: t("settings.appearance_card.theme_dark") }
            ]}
            allowDeselect={false}
          />
        </Stack>
      </Card>

      <Card withBorder padding="lg" radius="md">
        <Stack gap="md">
          <Title order={4}>{t("settings.mapping_card.title")}</Title>
          <Text size="sm" c="dimmed">
            {t("settings.mapping_card.source_hint", { repo: CATALOG_REPO })}
            <br />
            {t("settings.mapping_card.last_fetched", {
              when: fetchedAt,
              count: catalog?.count ?? 0
            })}
          </Text>
          <Group>
            <Button
              variant="default"
              loading={refresh.isPending}
              onClick={() => refresh.mutate()}
            >
              {t("settings.mapping_card.refresh_now")}
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
