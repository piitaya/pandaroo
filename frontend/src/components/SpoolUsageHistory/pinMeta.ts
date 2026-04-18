import {
  IconArrowDownToArc,
  IconArrowUpFromArc,
  IconPencil,
  IconRefresh,
  IconScan,
  type Icon,
} from "@tabler/icons-react";
import type { TFunction } from "i18next";
import type { PinKind } from "./useSpoolUsageModel";

export type PinColor = "blue" | "grape" | "cyan";

/** Single accent for every AMS session — rail band, chip, enter/exit icons. */
export const SESSION_COLOR: PinColor = "blue";

export interface PinMeta {
  title: string;
  Icon: Icon;
  color: PinColor;
}

export function pinMeta(kind: PinKind, t: TFunction): PinMeta {
  switch (kind) {
    case "enter":
      return {
        title: t("spool_detail.usage.event.enter"),
        Icon: IconArrowDownToArc,
        color: SESSION_COLOR,
      };
    case "exit":
      return {
        title: t("spool_detail.usage.event.exit"),
        Icon: IconArrowUpFromArc,
        color: SESSION_COLOR,
      };
    case "manual":
      return {
        title: t("spool_detail.usage.event.manual"),
        Icon: IconPencil,
        color: "grape",
      };
    case "scan":
      return {
        title: t("spool_detail.usage.event.scan"),
        Icon: IconScan,
        color: "cyan",
      };
    case "ams_last":
      return {
        title: t("spool_detail.usage.event.ams_last"),
        Icon: IconRefresh,
        color: SESSION_COLOR,
      };
  }
}
