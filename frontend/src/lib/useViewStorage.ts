import { useEffect, useState } from "react";

export function useViewStorage<T extends string>(
  storageKey: string,
  values: readonly T[],
  fromUrl: () => T,
  urlHasKey: boolean,
): [T, (next: T) => void] {
  const [view, setView] = useState<T>(() => {
    if (urlHasKey) return fromUrl();
    const stored = localStorage.getItem(storageKey);
    if (stored != null && (values as readonly string[]).includes(stored)) {
      return stored as T;
    }
    return fromUrl();
  });
  useEffect(() => {
    localStorage.setItem(storageKey, view);
  }, [storageKey, view]);
  return [view, setView];
}
