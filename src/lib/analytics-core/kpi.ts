// ============================================================================
// ZONO — Analytics Core: KPI card builder (pure, canonical).
// ============================================================================
import { direction } from "./percentages";
import type { KpiCardDTO, KpiFormat } from "./types";

export interface KpiSpec {
  key: string;
  label: string;
  value: number;
  format?: KpiFormat;
  previous?: number | null;     // baseline for change %
  changePercent?: number | null; // explicit change % (overrides previous)
  sub?: string;
}

/** Build a canonical KPI card, computing change %/direction deterministically. */
export function buildKpiCard(spec: KpiSpec): KpiCardDTO {
  const format = spec.format ?? "int";
  let changePercent = spec.changePercent ?? null;
  if (changePercent == null && spec.previous != null && spec.previous !== 0) {
    changePercent = Math.round(((spec.value - spec.previous) / Math.abs(spec.previous)) * 1000) / 10;
  }
  return { key: spec.key, label: spec.label, value: spec.value, format, changePercent, direction: direction(changePercent), sub: spec.sub };
}

export function buildKpiCards(specs: KpiSpec[]): KpiCardDTO[] {
  return specs.map(buildKpiCard);
}
