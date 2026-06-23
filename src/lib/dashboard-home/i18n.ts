// ============================================================================
// ZONO — Home dashboard i18n. Lightweight, dependency-free dictionary access so
// the homepage is i18n-ready from day one. UI strings live in
// locales/<locale>/dashboard.json; components read them via `tr(dict, key)` and
// never hardcode Hebrew. Default locale is Hebrew (RTL).
// ============================================================================
import he from "@/locales/he/dashboard.json";
import en from "@/locales/en/dashboard.json";

export type Locale = "he" | "en";
export type DashboardDict = typeof he;

const DICTS: Record<Locale, DashboardDict> = { he, en: en as DashboardDict };

export function getDashboardDict(locale: Locale = "he"): DashboardDict {
  return DICTS[locale] ?? DICTS.he;
}

/** Resolve a dotted translation key (e.g. "heatMap.title"); falls back to key. */
export function tr(dict: DashboardDict, key: string): string {
  const val = key.split(".").reduce<unknown>(
    (acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined),
    dict,
  );
  return typeof val === "string" ? val : key;
}
