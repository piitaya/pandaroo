import { useMemo } from "react";
import type { SpoolHistoryEvent } from "../../api";

export type PinKind = "enter" | "exit" | "manual" | "scan" | "ams_last";

export interface UsageSession {
  start: number;
  /** `null` while the session is still open. */
  end: number | null;
  amsId: number;
  slotId: number;
  startEvent: SpoolHistoryEvent;
  endEvent: SpoolHistoryEvent | null;
}

export interface UsagePin {
  kind: PinKind;
  t: number;
  event: SpoolHistoryEvent;
  /** Enclosing session when the pin happened during one. */
  session: UsageSession | null;
}

export interface UsageModel {
  sessions: UsageSession[];
  pins: UsagePin[];
}

/**
 * Normalize the raw event log into AMS sessions (enter→exit pairs) plus
 * standalone pins (manual weighings, scans, the last AMS reading). The
 * `ams_last` pin is emitted only while a session is still open — once the
 * spool is removed, any prior AMS reading is stale and lives inside the
 * session band.
 */
export function useSpoolUsageModel(
  events: SpoolHistoryEvent[] | undefined,
): UsageModel {
  return useMemo(() => {
    const src = events ?? [];
    // Tie-break on id — `datetime('now')` has second precision so sequential
    // events can share a `created_at`.
    const ascending = [...src].sort(
      (a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id,
    );

    const sessions: UsageSession[] = [];
    const pins: UsagePin[] = [];
    let open: UsageSession | null = null;

    for (const event of ascending) {
      const t = new Date(event.created_at).getTime();
      if (
        event.event_type === "ams_load" &&
        event.ams_id != null &&
        event.slot_id != null
      ) {
        open = {
          start: t,
          end: null,
          amsId: event.ams_id,
          slotId: event.slot_id,
          startEvent: event,
          endEvent: null,
        };
        pins.push({ kind: "enter", t, event, session: open });
      } else if (event.event_type === "ams_unload" && open) {
        open.end = t;
        open.endEvent = event;
        sessions.push(open);
        pins.push({ kind: "exit", t, event, session: open });
        open = null;
      } else if (event.event_type === "adjust") {
        pins.push({ kind: "manual", t, event, session: open });
      } else if (event.event_type === "scan") {
        pins.push({ kind: "scan", t, event, session: open });
      }
    }

    if (open) {
      for (let i = ascending.length - 1; i >= 0; i--) {
        const e = ascending[i];
        if (e.event_type === "ams_update") {
          pins.push({
            kind: "ams_last",
            t: new Date(e.created_at).getTime(),
            event: e,
            session: open,
          });
          break;
        }
      }
      sessions.push(open);
    }

    return { sessions, pins };
  }, [events]);
}
