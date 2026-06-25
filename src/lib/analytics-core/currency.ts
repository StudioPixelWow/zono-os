// ============================================================================
// ZONO — Analytics Core: currency + value formatting (pure, canonical, he-IL).
// ============================================================================
import type { KpiFormat } from "./types";

const HE = "he-IL";

export function formatCurrency(value: number): string {
  return `₪${Math.round(value).toLocaleString(HE)}`;
}

/** Compact ₪ for dense KPI tiles: 1.2M / 850K / 12,000. */
export function formatCurrencyCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `₪${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 10_000) return `₪${Math.round(value / 1000)}K`;
  return `₪${Math.round(value).toLocaleString(HE)}`;
}

export function formatInt(value: number): string {
  return Math.round(value).toLocaleString(HE);
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

/** Format any KPI value by its declared format. */
export function formatKpi(value: number, format: KpiFormat): string {
  return format === "currency" ? formatCurrency(value) : format === "percent" ? formatPercent(value) : formatInt(value);
}
