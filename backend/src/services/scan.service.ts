import type { Spool } from "../domain/spool.js";
import { matchSpool, type FilamentEntry, type MatchType } from "../domain/matcher.js";
import type { SpoolService } from "./spool.service.js";

export interface ScanResult {
  spool: Spool;
  match: MatchType;
}

export function scanSpool(
  spool: Spool,
  mapping: Map<string, FilamentEntry>,
  spoolService: SpoolService,
): ScanResult {
  const match = matchSpool(spool, mapping);
  spoolService.upsert(spool);

  return {
    spool,
    match: match.type,
  };
}
