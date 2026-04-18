import type { TFunction } from "i18next";
import { amsLabel } from "../amsLabel";

const DATE_KEY = "date";
const TIME_KEY = "time";

type FormatterKey = typeof DATE_KEY | typeof TIME_KEY;

const OPTIONS: Record<FormatterKey, Intl.DateTimeFormatOptions> = {
  [DATE_KEY]: { day: "numeric", month: "short" },
  [TIME_KEY]: { hour: "2-digit", minute: "2-digit" },
};

// Intl.DateTimeFormat instances are expensive to construct and cheap to reuse.
// Cache them per (locale × kind) so per-row rendering is just a `.format()` call.
const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, key: FormatterKey): Intl.DateTimeFormat {
  const cacheKey = `${locale}|${key}`;
  let f = cache.get(cacheKey);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, OPTIONS[key]);
    cache.set(cacheKey, f);
  }
  return f;
}

function formatDate(time: number, locale: string): string {
  return formatter(locale, DATE_KEY).format(time);
}

function formatTime(time: number, locale: string): string {
  return formatter(locale, TIME_KEY).format(time);
}

export function formatDateTime(time: number, locale: string): string {
  return `${formatDate(time, locale)}, ${formatTime(time, locale)}`;
}

export function formatAmsSlot(
  t: TFunction,
  amsId: number,
  slotId: number,
): string {
  return `${amsLabel(amsId)} · ${t("slot.label", { n: slotId + 1 })}`;
}
