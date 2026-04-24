import { useLayoutEffect, useRef } from "react";
import { NavigationType, useLocation, useNavigationType } from "react-router-dom";

interface Result {
  panelScrollRef: React.RefObject<HTMLDivElement>;
  tableScrollRef: React.RefObject<HTMLDivElement>;
  saveScroll: () => void;
}

export function useScrollSaveRestore(
  effectiveView: "table" | "grid" | "list",
  readyCount: number,
): Result {
  const panelScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const hasRestored = useRef(false);
  const navigationType = useNavigationType();
  const location = useLocation();

  useLayoutEffect(() => {
    if (hasRestored.current) return;
    if (navigationType !== NavigationType.Pop) {
      hasRestored.current = true;
      return;
    }
    if (!readyCount) return;
    const el =
      effectiveView === "table" ? tableScrollRef.current : panelScrollRef.current;
    if (!el) return;
    const state = location.state as { scroll?: number } | null;
    if (typeof state?.scroll === "number") el.scrollTop = state.scroll;
    hasRestored.current = true;
  }, [readyCount, effectiveView, navigationType, location.state]);

  const saveScroll = () => {
    const el =
      effectiveView === "table" ? tableScrollRef.current : panelScrollRef.current;
    if (!el) return;
    const current = window.history.state ?? {};
    window.history.replaceState(
      { ...current, usr: { ...(current.usr ?? {}), scroll: el.scrollTop } },
      "",
    );
  };

  return { panelScrollRef, tableScrollRef, saveScroll };
}
