// ============================================================================
// ZONO — Agency territory calculator (Phase 26.4, PURE, client-safe).
// Turns loaded agency listing/deal rows + territory denominators into a typed
// stats object. DATA SAFETY: averages / shares / velocities are null when not
// computable — never a fabricated 0. Observed integer counts (e.g. 0 sales) are
// real and returned as-is.
// ============================================================================
import {
  avgOrNull, shareOrNull, territoryLabel,
} from "./agencyTerritoryTypes";
import type {
  TerritoryCalcInput, ComputedTerritoryStats,
  TerritoryOpportunity, TerritoryType,
} from "./agencyTerritoryTypes";
import { scoreDominance, scoreMomentum, scoreConfidence } from "./agencyDominanceScoring";

const inPeriod = (iso: string | null, start: string, end: string): boolean =>
  !!iso && iso >= start && iso <= end;

/** Normalize a per-period count to a per-30-day velocity (rounded). */
function velocity(count: number, periodDays: number): number {
  if (periodDays <= 0) return 0;
  return Math.round((count / periodDays) * 30 * 100) / 100;
}

/** Compute typed territory stats for one (agency, territory, period). */
export function computeTerritoryStats(input: TerritoryCalcInput): ComputedTerritoryStats {
  const { listings, totals, previous, periodDays, periodStart, periodEnd } = input;

  const active = listings.filter((l) => l.status === "active");
  const historical = listings.filter((l) => l.status === "historical");
  const sold = listings.filter((l) => l.status === "sold");
  const exclusive = listings.filter((l) => l.isExclusive);

  const activeListingsCount = active.length;
  const historicalListingsCount = historical.length;
  const soldCount = sold.length;
  const exclusiveCount = exclusive.length;
  const totalAgencyListings = listings.length;

  // Price drops: null unless we have any price-history signal.
  const hasDropData = listings.some((l) => l.priceDropped !== null);
  const priceDropCount = hasDropData ? listings.filter((l) => l.priceDropped === true).length : null;

  // Averages (null when no usable data).
  const avgPrice = avgOrNull(listings.map((l) => l.price));
  const avgPricePerSqm = avgOrNull(
    listings.map((l) => (l.price != null && l.sqm != null && l.sqm > 0 ? Math.round(l.price / l.sqm) : null)),
  );
  const avgDaysOnMarket = avgOrNull(listings.map((l) => l.daysOnMarket));

  // Velocities.
  const datedListings = listings.filter((l) => l.firstSeenAt);
  const newInPeriod = datedListings.filter((l) => inPeriod(l.firstSeenAt, periodStart, periodEnd)).length;
  const listingVelocity = datedListings.length === 0 && totalAgencyListings > 0 ? null : velocity(newInPeriod, periodDays);

  const soldDated = sold.filter((l) => l.saleDate);
  const soldInPeriod = soldDated.filter((l) => inPeriod(l.saleDate, periodStart, periodEnd)).length;
  const salesVelocity = soldCount === 0
    ? (totalAgencyListings > 0 ? 0 : null)        // observed no sales (with inventory) vs no data at all
    : (soldDated.length === 0 ? null : velocity(soldInPeriod, periodDays));

  // Shares.
  const inventoryShare = shareOrNull(activeListingsCount, totals.activeAll);
  const salesShare = shareOrNull(soldCount, totals.soldAll);
  const exclusiveShare = shareOrNull(exclusiveCount, totalAgencyListings || null);

  // Luxury share: agency luxury listings ÷ agency priced listings, where luxury
  // = price ≥ 1.5× the territory median. Null when the median is unknown.
  const luxuryThreshold = totals.medianPrice != null ? totals.medianPrice * 1.5 : null;
  const agencyPriced = listings.filter((l) => l.price != null).length;
  const luxuryCount = luxuryThreshold != null ? listings.filter((l) => l.price != null && l.price >= luxuryThreshold).length : 0;
  const luxuryShare = luxuryThreshold == null ? null : shareOrNull(luxuryCount, agencyPriced || null);

  // Momentum.
  const { momentumScore, trend } = scoreMomentum(
    { newListings: newInPeriod, sold: soldInPeriod, activeInventory: activeListingsCount, priceDrops: priceDropCount },
    previous,
  );

  // Dominance (over available components only).
  const dominanceScore = scoreDominance({
    inventoryShare, salesShare, listingVelocity, salesVelocity, luxuryShare, exclusiveShare, momentumScore,
  });

  // Confidence (data completeness).
  const pricedCount = listings.filter((l) => l.price != null).length;
  const datedCount = listings.filter((l) => l.firstSeenAt || l.saleDate).length;
  const confidence = scoreConfidence({
    listingCount: totalAgencyListings,
    hasTotals: totals.activeAll != null || totals.soldAll != null,
    hasPrevious: previous != null,
    pricedCount,
    datedCount,
  });

  return {
    activeListingsCount, historicalListingsCount, soldCount, exclusiveCount,
    priceDropCount, avgPrice, avgPricePerSqm, avgDaysOnMarket,
    listingVelocity, salesVelocity, inventoryShare, salesShare, luxuryShare, exclusiveShare,
    dominanceScore, momentumScore, trend, confidence,
  };
}

// ── Opportunity detection ─────────────────────────────────────────────────────

export interface TerritoryOpportunityContext {
  territoryType: TerritoryType;
  city: string | null;
  neighborhood: string | null;
  street: string | null;
  totalActive: number | null;
  totalSold: number | null;
  medianPrice: number | null;
  luxuryAll: number | null;
}

/**
 * Detect territory opportunities/threats from the USER agency's stats vs the
 * strongest competitor in the same territory. Deterministic + non-noisy: a rule
 * fires only when its data preconditions are met (no guessing on null data).
 */
export function detectTerritoryOpportunities(
  userStats: ComputedTerritoryStats | null,
  topCompetitor: { dominanceScore: number | null; trend: string; momentumScore: number | null } | null,
  ctx: TerritoryOpportunityContext,
): TerritoryOpportunity[] {
  const out: TerritoryOpportunity[] = [];
  const label = territoryLabel(ctx.city, ctx.neighborhood, ctx.street);
  const base = { territoryType: ctx.territoryType, territoryLabel: label };
  const userInv = userStats?.inventoryShare ?? 0;
  const userActive = userStats?.activeListingsCount ?? 0;

  // High demand (many active listings) + low user presence.
  if ((ctx.totalActive ?? 0) >= 8 && userInv < 0.15) {
    out.push({ ...base, type: "territory_opportunity", severity: "info",
      title: `הזדמנות באזור ${label}: ביקוש גבוה ונוכחות נמוכה שלך`,
      description: `${ctx.totalActive} מודעות פעילות באזור, נתח שלך נמוך.`,
      metadata: { totalActive: ctx.totalActive, userInventoryShare: userInv } });
  }

  // Competitor dominates and the user is weak/absent.
  if (topCompetitor && (topCompetitor.dominanceScore ?? 0) >= 60 && userInv < 0.2) {
    out.push({ ...base, type: "competitor_dominance", severity: "warning",
      title: `מתחרה שולט באזור ${label}`,
      description: `ציון שליטה של מתחרה ${Math.round(topCompetitor.dominanceScore ?? 0)} מול נתח נמוך שלך.`,
      metadata: { competitorDominance: topCompetitor.dominanceScore, userInventoryShare: userInv } });
  }

  // User present but weak (territory has listings, user dominance low).
  if (userStats && (userStats.dominanceScore ?? 0) < 30 && (ctx.totalActive ?? 0) >= 5 && userActive > 0) {
    out.push({ ...base, type: "user_weak_area", severity: "warning",
      title: `אזור חלש שלך: ${label}`,
      description: `נוכחות קיימת אך שליטה נמוכה (${Math.round(userStats.dominanceScore ?? 0)}).`,
      metadata: { userDominance: userStats.dominanceScore, totalActive: ctx.totalActive } });
  }

  // Competitor losing momentum — a window to grow.
  if (topCompetitor && topCompetitor.trend === "declining" && (topCompetitor.dominanceScore ?? 0) >= 40) {
    out.push({ ...base, type: "competitor_momentum", severity: "info",
      title: `מתחרה מאבד תאוצה באזור ${label}`,
      description: "חלון הזדמנות להגדלת נוכחות.",
      metadata: { competitorTrend: topCompetitor.trend, competitorMomentum: topCompetitor.momentumScore } });
  }

  // Luxury territory with low luxury coverage.
  if ((ctx.medianPrice ?? 0) > 0 && (ctx.luxuryAll ?? 0) <= 1 && (ctx.totalActive ?? 0) >= 4) {
    out.push({ ...base, type: "low_competition_area", severity: "info",
      title: `אזור יוקרה עם תחרות נמוכה: ${label}`,
      description: "מעט מודעות יוקרה — פוטנציאל לבידול.",
      metadata: { medianPrice: ctx.medianPrice, luxuryAll: ctx.luxuryAll } });
  }

  // Street-level: competitor active, user absent.
  if (ctx.territoryType === "street" && userActive === 0 && (ctx.totalActive ?? 0) >= 2) {
    out.push({ ...base, type: "user_weak_area", severity: "info",
      title: `רחוב עם פעילות מתחרים וללא נוכחות שלך: ${label}`,
      description: `${ctx.totalActive} מודעות באזור, אין לך נוכחות.`,
      metadata: { totalActive: ctx.totalActive } });
  }

  return out;
}
