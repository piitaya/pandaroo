import type { TFunction } from "i18next";
import type { AmsLocation } from "../api";
import { amsLabel } from "./amsLabel";

export function formatAmsLocation(location: AmsLocation, t: TFunction): string {
  return `${location.printer_name} · ${amsLabel(location.ams_id)} · ${t("slot.label", { n: location.slot_id + 1 })}`;
}
