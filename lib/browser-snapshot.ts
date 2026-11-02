"use client";

import { useSyncExternalStore } from "react";

const emptySnapshot = () => "";
function subscribeLocation(notify: () => void) {
  window.addEventListener("popstate", notify);
  return () => window.removeEventListener("popstate", notify);
}
/** Stable primitive snapshots keep SSR and hydration consistent. */
export function useLocationSearch() {
  return useSyncExternalStore(subscribeLocation, () => window.location.search, emptySnapshot);
}
export function useBrowserLanguage() {
  return useSyncExternalStore(subscribeLanguage, () => navigator.languages?.join(",") || navigator.language || "", emptySnapshot);
}
function subscribeLanguage(notify: () => void) {
  window.addEventListener("languagechange", notify);
  return () => window.removeEventListener("languagechange", notify);
}
export function useStoredString(key: string) {
  return useSyncExternalStore(
    (notify) => {
      const onStorage = (event: StorageEvent) => { if (event.key === key || event.key === null) notify(); };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
    () => { try { return window.localStorage.getItem(key) || ""; } catch { return ""; } },
    emptySnapshot,
  );
}
