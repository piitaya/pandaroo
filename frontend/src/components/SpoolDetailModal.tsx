import { ResponsiveDetailModal } from "./ResponsiveDetailModal";
import { SpoolDetailContent } from "./SpoolDetailContent";
import type { Spool } from "../api";

export function SpoolDetailModal({
  spool,
  opened,
  onClose
}: {
  spool: Spool;
  opened: boolean;
  onClose: () => void;
}) {
  const title = spool.color_name ?? spool.product ?? spool.material ?? spool.tag_id;

  return (
    <ResponsiveDetailModal opened={opened} onClose={onClose} title={title}>
      <SpoolDetailContent spool={spool} />
    </ResponsiveDetailModal>
  );
}
