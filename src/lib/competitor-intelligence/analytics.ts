// ============================================================================
// ZONO — Competitor analytics (pure, deterministic). Aggregates competitor
// listing links + price-drop events into per-competitor metrics. All share
// figures are labeled estimates and carry confidence. No private data.
// ============================================================================
import type { CompetitorAnalytics, CompetitorListingLink, Trend } from "./types";

export const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
export const pct = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

export function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
}

function topCounts(values: (string | null)[], limit: number): { key: string; count: number; percent: number }[] {
  const m = new Map<string, number>();
  let total = 0;
  for (const v of values) {
    const k = (v ?? "").trim();
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
    total++;
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count, percent: pct(count, total) }));
}

/** Israeli price segments (₪). Deterministic buckets. */
export function priceSegment(price: number | null): string {
  if (price == null || price <= 0) return "לא ידוע";
  if (price < 1_500_000) return "עד 1.5M";
  if (price < 2_500_000) return "1.5M–2.5M";
  if (price < 4_000_000) return "2.5M–4M";
  if (price < 7_000_000) return "4M–7M";
  return "7M+";
}

export interface AnalyticsInput {
  competitorProfileId: string;
  competitorName: string;
  confidence: number;
  links: CompetitorListingLink[];
  priceDropSourceIds: Set<string>;     // source ids with a price_drop event in window
  removedSourceIds: Set<string>;
  backOnMarketSourceIds: Set<string>;
  todayIso: string;
  weekAgoIso: string;
  prevWeekActiveListings: number | null;
  monitoredActiveInScope: number;       // denominator for share estimate
  now: number;
}

export function computeCompetitorAnalytics(i: AnalyticsInput): CompetitorAnalytics {
  const active = i.links.filter((l) => l.status === "active");
  const activeListings = active.length;

  const newToday = active.filter((l) => (l.firstSeenAt ?? "") >= i.todayIso).length;
  const newWeek = active.filter((l) => (l.firstSeenAt ?? "") >= i.weekAgoIso).length;

  const priceDrops = i.links.filter((l) => i.priceDropSourceIds.has(l.marketPropertySourceId)).length;
  const removed = i.links.filter((l) => i.removedSourceIds.has(l.marketPropertySourceId)).length;
  const backOnMarket = i.links.filter((l) => i.backOnMarketSourceIds.has(l.marketPropertySourceId)).length;

  const prices = active.map((l) => l.price).filter((p): p is number => typeof p === "number" && p > 0);
  const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null;

  const domDays = active
    .map((l) => (l.firstSeenAt ? (i.now - Date.parse(l.firstSeenAt)) / 86_400_000 : null))
    .filter((d): d is number => d != null && Number.isFinite(d) && d >= 0);
  const avgDaysOnMarket = domDays.length ? Math.round((domDays.reduce((a, b) => a + b, 0) / domDays.length) * 10) / 10 : null;

  const strongestNeighborhoods = topCounts(active.map((l) => l.neighborhood ?? l.city), 5).map((x) => ({ area: x.key, count: x.count }));
  const propertyTypeMix = topCounts(active.map((l) => l.propertyType), 6);
  const priceSegmentMix = topCounts(active.map((l) => priceSegment(l.price)), 6);

  const estimatedSharePercent = pct(activeListings, i.monitoredActiveInScope);
  const shareConfidence: CompetitorAnalytics["shareConfidence"] =
    i.monitoredActiveInScope >= 50 ? "high" : i.monitoredActiveInScope >= 15 ? "medium" : "low";

  const trendDeltaPercent = i.prevWeekActiveListings == null ? null : pctChange(activeListings, i.prevWeekActiveListings);
  const trend: Trend = trendDeltaPercent == null ? "stable" : trendDeltaPercent > 10 ? "up" : trendDeltaPercent < -10 ? "down" : "stable";

  return {
    competitorProfileId: i.competitorProfileId,
    competitorName: i.competitorName,
    confidence: i.confidence,
    activeListings,
    newListingsToday: newToday,
    newListingsThisWeek: newWeek,
    priceDrops,
    removedListings: removed,
    backOnMarket,
    avgPrice,
    avgDaysOnMarket,
    strongestNeighborhoods,
    propertyTypeMix,
    priceSegmentMix,
    estimatedSharePercent,
    shareConfidence,
    trendVsLastWeek: trend,
    trendDeltaPercent,
  };
}
