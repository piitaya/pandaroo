import { hasUid, type Spool } from "../domain/spool.js";
import type { SpoolRepository } from "../db/spool.repository.js";

export type SpoolChangeListener = (tagId: string) => void;

export interface SpoolService {
  upsert(spool: Spool, options?: { lastUsed?: string }): void;
  setChangeListener(listener: SpoolChangeListener | null): void;
}

export function createSpoolService(spoolRepo: SpoolRepository): SpoolService {
  let listener: SpoolChangeListener | null = null;

  return {
    upsert(spool, options) {
      if (!hasUid(spool)) return;
      const now = new Date().toISOString();
      const existing = spoolRepo.findByTagId(spool.uid);

      if (existing) {
        spoolRepo.update(spool.uid, {
          variantId: spool.variant_id ?? existing.variantId,
          material: spool.material ?? existing.material,
          product: spool.product ?? existing.product,
          colorHex: spool.color_hex ?? existing.colorHex,
          weight: spool.weight ?? existing.weight,
          remain: spool.remain ?? existing.remain,
          lastUsed: options?.lastUsed ?? existing.lastUsed,
          lastUpdated: now,
        });
      } else {
        spoolRepo.create({
          tagId: spool.uid,
          variantId: spool.variant_id,
          material: spool.material,
          product: spool.product,
          colorHex: spool.color_hex,
          weight: spool.weight,
          remain: spool.remain,
          lastUsed: options?.lastUsed,
          lastUpdated: now,
          firstSeen: now,
        });
      }

      listener?.(spool.uid);
    },

    setChangeListener(l) {
      listener = l;
    },
  };
}
