import { Alert, Button, Stack, Text } from "@mantine/core";
import { IconExternalLink, IconFlag } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { CATALOG_REPO } from "@pandaroo/shared";
import type { SlotMatchType, SpoolMatchType, SpoolReading } from "../api";

const TEMPLATE = "unknown-filament.yml";

interface Props {
  source: SpoolReading;
  matchType: SlotMatchType | SpoolMatchType;
}

export function ReportUnknownFilamentAlert({ source, matchType }: Props) {
  const { t } = useTranslation();
  if (matchType !== "unknown" || !source.variant_id) return null;

  const params = new URLSearchParams();
  params.set("template", TEMPLATE);
  params.set("title", `Add ${source.variant_id}`);
  params.set("variant_id", source.variant_id);
  if (source.material) params.set("material", source.material);
  if (source.product) params.set("product", source.product);
  if (source.color_hex) params.set("color_hex", source.color_hex);
  if (source.color_hexes && source.color_hexes.length > 0) {
    params.set("color_hexes", source.color_hexes.join(", "));
  }
  if (source.temp_min != null) params.set("temp_min", String(source.temp_min));
  if (source.temp_max != null) params.set("temp_max", String(source.temp_max));
  if (source.weight != null) params.set("weight", String(source.weight));
  const href = `https://github.com/${CATALOG_REPO}/issues/new?${params.toString()}`;

  return (
    <Alert
      icon={<IconFlag size={18} />}
      title={t("unknown_filament.title")}
      color="orange"
      variant="light"
      p="sm"
    >
      <Stack gap="xs" align="flex-start">
        <Text size="sm">{t("unknown_filament.description")}</Text>
        <Button
          component="a"
          href={href}
          target="_blank"
          rel="noreferrer"
          size="xs"
          variant="light"
          color="orange"
          rightSection={<IconExternalLink size={14} />}
        >
          {t("unknown_filament.action")}
        </Button>
      </Stack>
    </Alert>
  );
}
