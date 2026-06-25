"use client";
// ============================================================================
// ZONO — recently-opened items, persisted in localStorage (`zono_recent_items`).
// Used by the Command Center "נפתחו לאחרונה" row. Honest empty state when none.
// Built on useSyncExternalStore so it's SSR-safe and never sets state in an
// effect (avoids cascading-render lint + hydration mismatch).
// ============================================================================
import { useCallback, useSyncExternalStore } from "react";

const KEY = "zono_recent_items";
const MAX = 8;

export interface RecentItem {
  id: string;
  label: string;
  href: string;
  icon?: string;
  category?: string;
  at: number; // epoch ms
}

const EMPTY: RecentItem[] = [];

// Cache so getSnapshot returns a referentially-stable value while raw is unchanged.
let cachedRaw: string | null = null;
let cachedVal: RecentItem[] = EMPTY;

function read(): RecentItem[] {
  if (typeof window === "undefined") return EMPTY;
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(KEY); } catch { return EMPTY; }
  if (raw === cachedRaw) return cachedVal;
  cachedRaw = raw;
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    cachedVal = Array.isArray(parsed) ? (parsed as RecentItem[]) : EMPTY;
  } catch {
    cachedVal = EMPTY;
  }
  return cachedVal;
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  window.addEventListener("storage", onStorage);
  window.addEventListener("zono:recent-updated", cb);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("zono:recent-updated", cb);
  };
}

function write(next: RecentItem[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("zono:recent-updated"));
  } catch { /* storage unavailable — non-fatal */ }
}

export function useRecentItems() {
  const items = useSyncExternalStore(subscribe, read, () => EMPTY);

  const push = useCallback((item: Omit<RecentItem, "at">) => {
    if (typeof window === "undefined" || !item.href) return;
    write([{ ...item, at: Date.now() }, ...read().filter((r) => r.id !== item.id)].slice(0, MAX));
  }, []);

  const clear = useCallback(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.removeItem(KEY); window.dispatchEvent(new Event("zono:recent-updated")); } catch { /* noop */ }
  }, []);

  return { items, push, clear };
}

/** Imperative helper for non-hook call sites (e.g. on navigation click). */
export function pushRecentItem(item: Omit<RecentItem, "at">) {
  if (typeof window === "undefined" || !item.href) return;
  write([{ ...item, at: Date.now() }, ...read().filter((r) => r.id !== item.id)].slice(0, MAX));
}
