// ============================================================================
// 🛒 ZONO — Marketplace Intelligence — classification (pure & deterministic).
// PHASE 58.0. Internal-routing-first links, duplicate detection, price anomaly,
// opportunity classification and market-health-by-area. No I/O, no fetching —
// this only reasons over listings already imported through the compliant flow.
// ============================================================================
import { sourceLabel } from "./registry";
import type {
  MarketListing, ListingRoute, DuplicateInfo, DuplicateKind, PriceAnomaly, AnomalyKind,
  MarketOpportunity, OpportunityKind, AreaHealth, HealthBand,
} from "./types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** INTERNAL FIRST: primary link is ALWAYS an internal ZONO route; external is secondary only. */
export function internalRoute(listing: MarketListing): ListingRoute {
  const internalId = listing.promotedPropertyId ?? listing.primaryPropertyId;
  const primaryHref = internalId ? `/properties/${internalId}` : `/marketplace/listing/${listing.id}`;
  const external = listing.listingUrl && /^https?:\/\//i.test(listing.listingUrl)
    ? { url: listing.listingUrl, source: sourceLabel(listing.source), label: "מקור חיצוני (משני)" }
    : null;
  return {
    primaryHref,
    primaryLabel: internalId ? "פתח נכס בזונו" : "פרטים בזונו",
    isInternalMatch: !!internalId,
    external,
  };
}

/** Detect whether a listing is already ours, a cross-source duplicate, or unique. */
export function detectDuplicate(listing: MarketListing, groupCounts: Map<string, number>): DuplicateInfo {
  if (listing.primaryPropertyId || listing.promotedPropertyId) {
    return { kind: "in_inventory" as DuplicateKind, groupId: listing.duplicateGroupId, note: "כבר קיים במלאי הפנימי." };
  }
  if (listing.duplicateGroupId && (groupCounts.get(listing.duplicateGroupId) ?? 0) > 1) {
    return { kind: "cross_source", groupId: listing.duplicateGroupId, note: "כפילות בין מקורות — אוחד." };
  }
  return { kind: "unique", groupId: listing.duplicateGroupId, note: "ליסטינג ייחודי." };
}

/** Compare a listing's price/sqm to the area median. */
export function priceAnomaly(listing: MarketListing, areaMedianPerSqm: number | null): PriceAnomaly {
  if (listing.price == null || !listing.sqm || !areaMedianPerSqm) {
    return { kind: "unknown" as AnomalyKind, deltaPct: null, confidence: 20, isOpportunity: false, note: "אין מספיק נתונים להשוואת מחיר." };
  }
  const perSqm = listing.price / listing.sqm;
  const deltaPct = Math.round(((perSqm - areaMedianPerSqm) / areaMedianPerSqm) * 100);
  const kind: AnomalyKind = deltaPct <= -12 ? "underpriced" : deltaPct >= 15 ? "overpriced" : "normal";
  const confidence = clamp(45 + Math.min(45, Math.abs(deltaPct)));
  return {
    kind, deltaPct, confidence, isOpportunity: kind === "underpriced",
    note: kind === "underpriced" ? `מתחת לחציון האזור ב-${Math.abs(deltaPct)}%` : kind === "overpriced" ? `מעל לחציון האזור ב-${deltaPct}%` : "בטווח השוק.",
  };
}

/** Classify a listing's opportunity (acquisition vs buyer-match vs watch). */
export function classifyOpportunity(listing: MarketListing, dup: DuplicateInfo, anomaly: PriceAnomaly, buyerMatches: number): MarketOpportunity | null {
  if (dup.kind === "in_inventory") return null;   // already ours — not a new opportunity
  const byOwner = /owner|private|פרטי/i.test(listing.listingSourceType);
  const reasons: string[] = [];
  if (anomaly.isOpportunity) reasons.push(anomaly.note);
  if (byOwner) reasons.push("מוכר פרטי — פוטנציאל בלעדיות");
  if (listing.opportunityScore >= 70) reasons.push(`ציון הזדמנות ${listing.opportunityScore}`);
  if (buyerMatches > 0) reasons.push(`${buyerMatches} קונים מתאימים במאגר`);
  if (dup.kind === "cross_source") reasons.push("מופיע במספר מקורות");

  const acquisitionSignal = anomaly.isOpportunity || byOwner || listing.opportunityScore >= 70;
  const kind: OpportunityKind = acquisitionSignal ? "acquisition" : buyerMatches > 0 ? "buyer_match" : "watch";
  const score = clamp(listing.opportunityScore * 0.5 + (anomaly.isOpportunity ? 25 : 0) + (byOwner ? 15 : 0) + Math.min(20, buyerMatches * 7));

  return {
    listingId: listing.id, kind,
    title: kind === "acquisition" ? `הזדמנות רכישה: ${listing.address ?? listing.city ?? "נכס"}` : kind === "buyer_match" ? `התאמת קונים: ${listing.address ?? listing.city ?? "נכס"}` : `למעקב: ${listing.address ?? listing.city ?? "נכס"}`,
    reasons: reasons.length ? reasons : ["למעקב שוק"],
    score, route: internalRoute(listing), duplicate: dup, anomaly, buyerMatches, requiresApproval: true,
  };
}

function median(nums: number[]): number | null {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}

/** Aggregate market health per area (city). */
export function marketHealthByArea(listings: MarketListing[]): AreaHealth[] {
  const byArea = new Map<string, MarketListing[]>();
  for (const l of listings) { const k = (l.city ?? "לא ידוע").trim() || "לא ידוע"; (byArea.get(k) ?? byArea.set(k, []).get(k)!).push(l); }

  const out: AreaHealth[] = [];
  for (const [area, ls] of byArea) {
    const medianPerSqm = median(ls.map((l) => (l.price && l.sqm ? l.price / l.sqm : NaN)).filter((n) => Number.isFinite(n)));
    const anomalyCount = ls.filter((l) => priceAnomaly(l, medianPerSqm).isOpportunity).length;
    const byOwnerCount = ls.filter((l) => /owner|private|פרטי/i.test(l.listingSourceType)).length;
    const supply: AreaHealth["supply"] = ls.length >= 20 ? "high" : ls.length < 5 ? "low" : "balanced";
    const band: HealthBand = supply === "high" ? "soft" : supply === "low" ? "hot" : "balanced";
    out.push({
      area, listings: ls.length, medianPrice: median(ls.map((l) => l.price ?? NaN)), medianPerSqm,
      byOwnerCount, anomalyCount, supply, band,
      note: band === "hot" ? "היצע נמוך — שוק לטובת המוכר." : band === "soft" ? "היצע גבוה — הזדמנויות רכישה." : "שוק מאוזן.",
    });
  }
  return out.sort((a, b) => b.listings - a.listings);
}
