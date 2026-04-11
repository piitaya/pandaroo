import { hasUid, type Spool } from "../domain/spool.js";
import { toSpoolUpsert, type SpoolRepository } from "../db/spool.repository.js";

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
      spoolRepo.upsert({
        ...toSpoolUpsert(spool),
        lastUsed: options?.lastUsed,
        lastUpdated: now,
        firstSeen: now,
      });
      listener?.(spool.uid);
    },

    setChangeListener(l) {
      listener = l;
    },
  };
}
