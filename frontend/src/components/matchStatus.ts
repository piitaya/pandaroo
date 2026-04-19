import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { SlotMatchType } from "../api";

export interface MatchStatusInfo {
  label: string;
  color: string;
  description: string;
}

const MATCH_COLORS: Record<SlotMatchType, string> = {
  mapped: "teal",
  unmapped: "yellow",
  unknown_variant: "orange",
  third_party: "gray",
  unidentified: "gray",
  empty: "gray"
};

export const MATCH_STATUS_ORDER: SlotMatchType[] = [
  "mapped",
  "unmapped",
  "unknown_variant",
  "third_party",
  "unidentified",
  "empty"
];

export function useMatchStatus(): Record<SlotMatchType, MatchStatusInfo> {
  const { t, i18n } = useTranslation();
  return useMemo(
    () => ({
      mapped: {
        label: t("status.mapped.label"),
        color: MATCH_COLORS.mapped,
        description: t("status.mapped.description")
      },
      unmapped: {
        label: t("status.unmapped.label"),
        color: MATCH_COLORS.unmapped,
        description: t("status.unmapped.description")
      },
      unknown_variant: {
        label: t("status.unknown.label"),
        color: MATCH_COLORS.unknown_variant,
        description: t("status.unknown.description")
      },
      third_party: {
        label: t("status.third_party.label"),
        color: MATCH_COLORS.third_party,
        description: t("status.third_party.description")
      },
      unidentified: {
        label: t("status.unidentified.label"),
        color: MATCH_COLORS.unidentified,
        description: t("status.unidentified.description")
      },
      empty: {
        label: t("status.empty.label"),
        color: MATCH_COLORS.empty,
        description: t("status.empty.description")
      }
    }),
    // i18n.language ensures the memo recomputes on language switch
    // even though the t function reference is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, i18n.language]
  );
}
