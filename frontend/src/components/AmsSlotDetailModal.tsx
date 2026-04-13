import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { amsLabel } from "./amsLabel";
import { ResponsiveDetailModal } from "./ResponsiveDetailModal";
import { SpoolDetailContent } from "./SpoolDetailContent";
import type { AmsMatchedSlot, Spool } from "../api";

function toSpool(slot: AmsMatchedSlot): Spool {
  const sp = slot.slot.spool;
  return {
    tag_id: sp?.tag_id ?? "",
    variant_id: sp?.variant_id ?? null,
    match_type: slot.type,
    material: sp?.material ?? null,
    product: sp?.product ?? null,
    color_hex: sp?.color_hex ?? null,
    color_hexes: sp?.color_hexes ?? null,
    color_name: slot.entry?.color_name ?? null,
    weight: sp?.weight ?? null,
    remain: sp?.remain ?? null,
    temp_min: sp?.temp_min ?? null,
    temp_max: sp?.temp_max ?? null,
    last_used: null,
    last_printer_serial: slot.slot.printer_serial,
    last_ams_id: slot.slot.ams_id,
    last_slot_id: slot.slot.slot_id,
    first_seen: "",
    last_updated: "",
    sync: slot.sync,
  };
}

export function AmsSlotDetailModal({
  slot,
  opened,
  onClose
}: {
  slot: AmsMatchedSlot;
  opened: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const s = slot.slot;
  const slotName = t("slot.label", { n: s.slot_id + 1 });
  const title = `${amsLabel(s.ams_id)} · ${slotName}`;
  const spool = useMemo(() => toSpool(slot), [slot]);

  return (
    <ResponsiveDetailModal opened={opened} onClose={onClose} title={title}>
      <SpoolDetailContent spool={spool} />
    </ResponsiveDetailModal>
  );
}
