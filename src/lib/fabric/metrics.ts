// ============================================================================
// ZONO INTELLIGENCE FABRIC™ — shared metrics (pure, deterministic, client-safe).
// ----------------------------------------------------------------------------
// THE canonical metric formulas for the whole platform. Every engine consumes
// these instead of re-deriving "activity score" / "growth score" / etc. ten
// different ways. All bounded 0..100, all deterministic, no I/O. One definition.
// ============================================================================
import type { MetricName, MetricSet } from "./types";

export const clamp = (n: number, lo = 0, hi = 100): number =>
  Math.max(lo, Math.min(hi, Math.round(Number.isFinite(n) ? n : 0)));

/** Herfindahl–Hirschman concentration (0..1) over a share distribution. */
export function hhi(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  return counts.reduce((a, c) => a + Math.pow(c / total, 2), 0);
}

/** Activity: recent volume vs a saturation point (default 20). */
export function activityScore(recentCount: number, saturation = 20): number {
  return clamp((recentCount / Math.max(1, saturation)) * 100);
}

/** Growth: signed % change centered at 50 (flat). +100% → 100, −100% → 0. */
export function growthScore(prev: number, curr: number): number {
  if (prev <= 0) return curr > 0 ? 75 : 50;
  const pct = ((curr - prev) / prev) * 100;
  return clamp(50 + pct / 2);
}

/** Trust: blends verification, source diversity and confidence. */
export function trustScore(input: { verified: boolean; sources: number; confidence: number }): number {
  const v = input.verified ? 40 : 0;
  const s = clamp(Math.min(30, input.sources * 10), 0, 30);
  const c = clamp(input.confidence) * 0.3;
  return clamp(v + s + c);
}

/** Competition intensity from market concentration: fragmented → intense. */
export function competitionScore(playerCounts: number[]): number {
  if (playerCounts.filter((c) => c > 0).length <= 1) return 10;
  return clamp((1 - hhi(playerCounts)) * 100);
}

/** Influence: market share + reach (cities) + recent activity. */
export function influenceScore(input: { sharePct: number; cities: number; activity: number }): number {
  const share = clamp(input.sharePct) * 0.5;
  const reach = clamp(Math.min(30, input.cities * 6), 0, 30);
  const act = clamp(input.activity) * 0.2;
  return clamp(share + reach + act);
}

/** Relationship strength from interaction count + recency + shared attributes. */
export function relationshipStrength(input: { interactions: number; daysSinceLast: number | null; sharedAttributes: number }): number {
  const inter = clamp(Math.min(50, input.interactions * 8), 0, 50);
  const recency = input.daysSinceLast == null ? 10 : clamp(30 - Math.min(30, input.daysSinceLast), 0, 30);
  const shared = clamp(Math.min(20, input.sharedAttributes * 7), 0, 20);
  return clamp(inter + recency + shared);
}

/** Coverage: known vs estimated total. */
export function coverageScore(known: number, estimatedTotal: number): number {
  if (estimatedTotal <= 0) return known > 0 ? 100 : 0;
  return clamp((known / estimatedTotal) * 100);
}

/** Completeness: filled weight vs total weight. */
export function completenessScore(filledWeight: number, totalWeight: number): number {
  if (totalWeight <= 0) return 0;
  return clamp((filledWeight / totalWeight) * 100);
}

/** Freshness: decays from 100 (now) to 0 over `maxAgeHours` (default 30 days). */
export function freshnessScore(lastUpdateISO: string | null, maxAgeHours = 720): number {
  if (!lastUpdateISO) return 0;
  const t = new Date(lastUpdateISO).getTime();
  if (Number.isNaN(t)) return 0;
  const ageH = (Date.now() - t) / 3_600_000;
  return clamp((1 - Math.min(1, ageH / maxAgeHours)) * 100);
}

/** Merge metric sets; later sources win per key (used to compose producers). */
export function mergeMetrics(...sets: (MetricSet | undefined)[]): MetricSet {
  const out: MetricSet = {};
  for (const s of sets) if (s) for (const [k, v] of Object.entries(s)) if (typeof v === "number") out[k as MetricName] = clamp(v);
  return out;
}

/** A single composite "health" of an entity from its metric set (weighted). */
export function compositeHealth(m: MetricSet): number {
  const w: Partial<Record<MetricName, number>> = { confidence: 3, completeness: 2, freshness: 2, trust: 2, activity: 1, coverage: 1 };
  let num = 0, den = 0;
  for (const [k, weight] of Object.entries(w)) {
    const v = m[k as MetricName];
    if (typeof v === "number") { num += v * (weight as number); den += weight as number; }
  }
  return den ? clamp(num / den) : 0;
}
