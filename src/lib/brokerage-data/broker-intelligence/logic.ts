// ============================================================================
// 🧠 Broker Intelligence — pure logic. Phase 26.5.
// Status classification, price/area stats, specialization tags and ranking —
// all from real evidence signals. No fabrication; insufficient data → UNKNOWN.
// ============================================================================
import type { BrokerStatus, PriceStats, BrokerRankCard } from "./types";

export interface StatusSignals {
  lastListingDays: number | null;   // days since the most recent listing was seen
  activeListings: number;
  recentListings: number;            // listings seen in the last ~90 days
  conflictingOffice: boolean;        // evidence links the broker to a different office
  hasCurrentOffice: boolean;
  totalListings: number;
}

/** Classify broker status from existing evidence (Part 2). */
export function classifyBrokerStatus(sig: StatusSignals): { status: BrokerStatus; reason: string } {
  if (sig.totalListings === 0 && sig.lastListingDays == null) return { status: "UNKNOWN", reason: "אין מודעות מקושרות — אין די ראיות" };
  if (sig.conflictingOffice) return { status: "MOVED_OFFICE", reason: "ראיה מקשרת את המתווך למשרד אחר — ייתכן מעבר" };
  if (sig.activeListings > 0 || (sig.lastListingDays != null && sig.lastListingDays <= 30)) return { status: "ACTIVE", reason: `${sig.activeListings} מודעות פעילות · נראה לאחרונה` };
  if (sig.lastListingDays != null && sig.lastListingDays <= 90) return { status: "RECENTLY_ACTIVE", reason: `מודעה אחרונה לפני ${sig.lastListingDays} ימים` };
  if (sig.lastListingDays != null && sig.lastListingDays <= 365) return { status: "LOW_ACTIVITY", reason: `פעילות דלה — מודעה אחרונה לפני ${sig.lastListingDays} ימים` };
  if (sig.lastListingDays != null) return { status: "INACTIVE", reason: `לא נראתה פעילות מעל שנה (${sig.lastListingDays} ימים)` };
  return { status: "UNKNOWN", reason: "אין תאריך פעילות" };
}

const clampAvg = (xs: number[]): number | null => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export function priceStats(prices: number[], sqms: number[], ppsqms: number[]): PriceStats {
  const p = prices.filter((x) => x > 0), sq = sqms.filter((x) => x > 0), pp = ppsqms.filter((x) => x > 0);
  return {
    count: p.length,
    avgPrice: clampAvg(p), minPrice: p.length ? Math.min(...p) : null, maxPrice: p.length ? Math.max(...p) : null,
    avgSqm: clampAvg(sq), avgPricePerSqm: clampAvg(pp),
  };
}

/** Specialization tags from real distribution (never invented). */
export function specializationTags(propertyTypes: string[], neighborhoods: string[], avgPrice: number | null): string[] {
  const tags: string[] = [];
  const typeCount = new Map<string, number>();
  for (const t of propertyTypes) if (t) typeCount.set(t, (typeCount.get(t) ?? 0) + 1);
  const topType = [...typeCount.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topType && topType[1] >= 2) tags.push(`מתמחה: ${topType[0]}`);
  if (neighborhoods.length === 1) tags.push(`מיקוד שכונתי: ${neighborhoods[0]}`);
  else if (neighborhoods.length >= 5) tags.push("כיסוי רחב");
  if (avgPrice != null && avgPrice >= 4_000_000) tags.push("סגמנט יוקרה");
  return tags;
}

/** 0..100 data-quality from field completeness. */
export function dataQuality(f: { hasPhone: boolean; hasOffice: boolean; hasCity: boolean; listings: number; hasTypes: boolean; hasPrices: boolean }): number {
  return Math.min(100,
    (f.hasPhone ? 20 : 0) + (f.hasOffice ? 20 : 0) + (f.hasCity ? 15 : 0)
    + Math.min(25, f.listings * 5) + (f.hasTypes ? 10 : 0) + (f.hasPrices ? 10 : 0));
}

/** Rank brokers inside an office (Part 3). Insufficient data → keeps natural order. */
export function rankBrokers(cards: BrokerRankCard[]): BrokerRankCard[] {
  return [...cards].sort((a, b) =>
    b.activeListings - a.activeListings
    || b.totalListings - a.totalListings
    || b.recentListings - a.recentListings
    || b.neighborhoods - a.neighborhoods
    || b.priceVolume - a.priceVolume
    || b.confidence - a.confidence
    || a.name.localeCompare(b.name, "he"));
}
