// ============================================================================
// Market Acceptance Intelligence™ — SIGNAL computation (PURE, client-safe).
//
// Turns observed lifecycle + event data into independent, explainable signals.
// EVIDENCE ONLY. No scores, no probability, no "likely sold", no interpretation.
// Every signal is { name, value, source, lastUpdated, confidence }. A missing
// input yields value=null with reduced confidence — values are never invented.
// ============================================================================
import type { ListingLifecycleState, Signal, SignalSet } from "./types";

const DAY_MS = 86_400_000;

/** One PRICE_CHANGED observation (prev → next), pre-extracted from the timeline. */
export interface PriceChangeObservation { prev: number | null; next: number | null }

/** All observed inputs for one listing. Anything unknown is null/0 — never faked. */
export interface SignalInput {
  provider: string;
  externalId: string;
  // lifecycle (market_listing_lifecycle)
  currentState: ListingLifecycleState;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  daysOnMarket: number | null;
  timesSeen: number | null;
  timesDisappeared: number | null;
  timesReturned: number | null;
  lastKnownPrice: number | null;
  // event-derived (market_listing_events)
  priceChanges: PriceChangeObservation[];
  imageChanges: number;
  descriptionChanges: number;
  statusChanges: number;
  // current listing (external_listings) — null when no live row matched
  currentPrice: number | null;
  hasCurrentListing: boolean;
  // dedup (external_listing_duplicates)
  duplicateConfidence: number | null; // 0..100 from the duplicate engine, or null
  providerCount: number | null;       // distinct providers for this property, or null
  // area aggregates (external_listings)
  neighborhoodActivity: number | null; // active listings in same neighborhood
  areaSupply: number | null;           // active listings in same city
  areaDemand: number | null;           // active buyers targeting the city, or null if unwired
  // official deals (property_transactions) — coarse, city-level proximity
  recentOfficialDealsNearby: number | null;
  transactionsAvailable: boolean;      // did the transactions read succeed for this area?
}

const daysBetween = (iso: string | null, nowMs: number): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / DAY_MS));
};

const sig = (name: string, value: Signal["value"], source: string, now: string, confidence: number): Signal =>
  ({ name, value, source, lastUpdated: now, confidence });

const GONE: ListingLifecycleState[] = ["DISAPPEARED", "RETURNED", "LIKELY_SOLD", "LIKELY_REMOVED", "UNKNOWN"];

/**
 * Compute the full evidence signal-set for one listing. Pure & deterministic.
 * @returns the SignalSet plus the confidence inputs that explain each score.
 */
export function computeListingSignals(
  input: SignalInput,
  nowMs: number = Date.now(),
): { signals: SignalSet; confidenceInputs: Record<string, unknown> } {
  const now = new Date(nowMs).toISOString();
  const LC = "market_listing_lifecycle";
  const EV = "market_listing_events";
  const EXT = "external_listings";
  const DUP = "external_listing_duplicates";
  const TXN = "property_transactions";

  const firstSeenDays = daysBetween(input.firstSeenAt, nowMs);
  const lastSeenDays = daysBetween(input.lastSeenAt, nowMs);

  // ── Price-derived facts (from observed PRICE_CHANGED events) ───────────────
  const drops = input.priceChanges
    .filter((c) => c.prev != null && c.next != null && (c.next as number) < (c.prev as number))
    .map((c) => (c.prev as number) - (c.next as number)); // positive reduction amounts
  const avgReduction = drops.length ? Math.round(drops.reduce((a, b) => a + b, 0) / drops.length) : null;
  const largestReduction = drops.length ? Math.max(...drops) : null;

  // PriceMomentum: net signed change across the observed series (last - first),
  // only when we have at least two real price points. Evidence, not a forecast.
  const pricePoints: number[] = [];
  for (const c of input.priceChanges) {
    if (c.prev != null) pricePoints.push(c.prev as number);
    if (c.next != null) pricePoints.push(c.next as number);
  }
  const hasMomentum = pricePoints.length >= 2;
  const priceMomentum = hasMomentum ? pricePoints[pricePoints.length - 1] - pricePoints[0] : null;

  const signals: SignalSet = {
    // Lifecycle timing
    DaysOnMarket:      sig("DaysOnMarket", input.daysOnMarket ?? firstSeenDays, LC, now, input.daysOnMarket != null || firstSeenDays != null ? 1 : 0),
    ListingAge:        sig("ListingAge", firstSeenDays, LC, now, firstSeenDays != null ? 1 : 0),
    FirstSeenDaysAgo:  sig("FirstSeenDaysAgo", firstSeenDays, LC, now, firstSeenDays != null ? 1 : 0),
    LastSeenDaysAgo:   sig("LastSeenDaysAgo", lastSeenDays, LC, now, lastSeenDays != null ? 1 : 0),

    // Lifecycle counters
    TimesSeen:         sig("TimesSeen", input.timesSeen ?? 0, LC, now, input.timesSeen != null ? 1 : 0),
    TimesDisappeared:  sig("TimesDisappeared", input.timesDisappeared ?? 0, LC, now, input.timesDisappeared != null ? 1 : 0),
    TimesReturned:     sig("TimesReturned", input.timesReturned ?? 0, LC, now, input.timesReturned != null ? 1 : 0),
    ReturnedAfterDisappear: sig("ReturnedAfterDisappear", (input.timesReturned ?? 0) > 0, LC, now, input.timesReturned != null ? 1 : 0),

    // State
    StillActive:       sig("StillActive", input.currentState === "ACTIVE", LC, now, 1),
    CurrentlyMissing:  sig("CurrentlyMissing", GONE.includes(input.currentState), LC, now, 1),
    CurrentState:      sig("CurrentState", input.currentState, LC, now, 1),

    // Price facts
    CurrentPrice:      sig("CurrentPrice", input.currentPrice, EXT, now, input.hasCurrentListing && input.currentPrice != null ? 1 : 0),
    LastKnownPrice:    sig("LastKnownPrice", input.lastKnownPrice, LC, now, input.lastKnownPrice != null ? 1 : 0),
    PriceChangesCount: sig("PriceChangesCount", input.priceChanges.length, EV, now, 1),
    AveragePriceReduction: sig("AveragePriceReduction", avgReduction, EV, now, drops.length ? 1 : 0),
    LargestPriceReduction: sig("LargestPriceReduction", largestReduction, EV, now, drops.length ? 1 : 0),
    PriceMomentum:     sig("PriceMomentum", priceMomentum, EV, now, hasMomentum ? 1 : 0),

    // Content churn
    ImageChanges:       sig("ImageChanges", input.imageChanges, EV, now, 1),
    DescriptionChanges: sig("DescriptionChanges", input.descriptionChanges, EV, now, 1),
    StatusChanges:      sig("StatusChanges", input.statusChanges, EV, now, 1),

    // Cross-listing / dedup
    DuplicateConfidence: sig("DuplicateConfidence", input.duplicateConfidence, DUP, now, input.duplicateConfidence != null ? 1 : 0),
    ProviderCount:       sig("ProviderCount", input.providerCount ?? 1, DUP, now, input.providerCount != null ? 1 : 0.5),

    // Area context
    NeighborhoodActivity: sig("NeighborhoodActivity", input.neighborhoodActivity, EXT, now, input.neighborhoodActivity != null ? 1 : 0),
    AreaSupply:           sig("AreaSupply", input.areaSupply, EXT, now, input.areaSupply != null ? 1 : 0),
    AreaDemand:           sig("AreaDemand", input.areaDemand, "buyers", now, input.areaDemand != null ? 1 : 0),

    // Official-deal proximity (coarse, city-level)
    RecentOfficialDealsNearby: sig("RecentOfficialDealsNearby", input.recentOfficialDealsNearby, TXN, now, input.transactionsAvailable ? 1 : 0),
    TransactionNearby:         sig("TransactionNearby", input.transactionsAvailable ? (input.recentOfficialDealsNearby ?? 0) > 0 : null, TXN, now, input.transactionsAvailable ? 1 : 0),
  };

  const confidenceInputs = {
    hasCurrentListing: input.hasCurrentListing,
    hasCurrentPrice: input.currentPrice != null,
    pricePoints: pricePoints.length,
    priceDrops: drops.length,
    hasFirstSeen: input.firstSeenAt != null,
    hasArea: input.areaSupply != null,
    transactionsAvailable: input.transactionsAvailable,
    areaDemandWired: input.areaDemand != null,
  };

  return { signals, confidenceInputs };
}
