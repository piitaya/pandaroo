import {
  Button,
  Card,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  Title,
  useMantineColorScheme
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  useConfig,
  useFilamentCatalog,
  usePutConfig,
  useRefreshMapping
} from "../hooks";
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  persistLanguage,
  type Language
} from "../i18n";

interface FormValues {
  refresh_interval_hours: number;
}

const REPO_LABEL = "piitaya/bambu-spoolman-db";

export default function SettingsPage() {
  const { data } = useConfig();
  const { data: catalog } = useFilamentCatalog();
  const put = usePutConfig();
  const refresh = useRefreshMapping();
  const { t, i18n } = useTranslation();
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  const form = useForm<FormValues>({
    initialValues: { refresh_interval_hours: 24 }
  });

  useEffect(() => {
    if (data?.filament_catalog) {
      form.setValues({
        refresh_interval_hours: data.filament_catalog.refresh_interval_hours
      });
      form.resetDirty({
        refresh_interval_hours: data.filament_catalog.refresh_interval_hours
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.filament_catalog.refresh_interval_hours]);

  const save = async (values: FormValues) => {
    if (!data) return;
    await put.mutateAsync({
      ...data,
      filament_catalog: {
        ...data.filament_catalog,
        refresh_interval_hours: values.refresh_interval_hours
      }
    });
  };

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
            {t("settings.mapping_card.source_hint", { repo: REPO_LABEL })}
            <br />
            {t("settings.mapping_card.last_fetched", {
              when: fetchedAt,
              count: catalog?.count ?? 0
            })}
          </Text>
          <form onSubmit={form.onSubmit(save)}>
            <Stack>
              <NumberInput
                label={t("settings.mapping_card.refresh_interval")}
                min={1}
                max={168}
                {...form.getInputProps("refresh_interval_hours")}
              />
              <Group>
                <Button type="submit" loading={put.isPending}>
                  {t("common.save")}
                </Button>
                <Button
                  variant="default"
                  loading={refresh.isPending}
                  onClick={() => refresh.mutate()}
                >
                  {t("settings.mapping_card.refresh_now")}
                </Button>
              </Group>
            </Stack>
          </form>
        </Stack>
      </Card>
    </Stack>
  );
}
