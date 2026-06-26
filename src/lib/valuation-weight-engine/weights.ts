// ============================================================================
// Valuation Weight Engine™ — configurable weight profiles + effective-weight
// computation (PURE, deterministic). Official transactions always remain the
// strongest source: when official has data, no other source's effective weight
// may exceed it.
// ============================================================================
import type { WeightProfile, WeightProfileName } from "./types";

/** Default profiles (each sums to 100). NOT hardcoded inside the calculator. */
export const WEIGHT_PROFILES: Record<WeightProfileName, WeightProfile> = {
  // Balanced default: official dominant, current market + acceptance meaningful.
  STANDARD:     { officialTransactions: 45, currentMarket: 20, marketAcceptance: 15, marketTrend: 10, listingSimilarity: 4, location: 3, propertyFeatures: 3 },
  // Trusts verified deals more; acceptance influence reduced.
  CONSERVATIVE: { officialTransactions: 55, currentMarket: 18, marketAcceptance: 8,  marketTrend: 9,  listingSimilarity: 4, location: 3, propertyFeatures: 3 },
  // Leans more on live market + acceptance signals (still official-dominant).
  AGGRESSIVE:   { officialTransactions: 38, currentMarket: 19, marketAcceptance: 22, marketTrend: 11, listingSimilarity: 4, location: 3, propertyFeatures: 3 },
  // Enterprise blend: high official + strong acceptance contribution.
  ENTERPRISE:   { officialTransactions: 48, currentMarket: 18, marketAcceptance: 16, marketTrend: 9,  listingSimilarity: 4, location: 3, propertyFeatures: 2 },
};

export function getWeightProfile(name: WeightProfileName): WeightProfile {
  return WEIGHT_PROFILES[name] ?? WEIGHT_PROFILES.STANDARD;
}

const SOURCES: (keyof WeightProfile)[] = [
  "officialTransactions", "currentMarket", "marketAcceptance", "marketTrend", "listingSimilarity", "location", "propertyFeatures",
];

/** Per-source availability gate (0..1). 0 → the source contributes nothing. */
export interface SourceAvailability {
  officialTransactions: number;
  currentMarket: number;
  marketAcceptance: number;
  marketTrend: number;
  listingSimilarity: number;
  location: number;
  propertyFeatures: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Effective, RENORMALIZED weights: profile base × availability/strength, then
 * normalized to 100 over present sources. When official transactions are present
 * the market-acceptance effective weight is capped at the official weight, so
 * acceptance can never out-weigh verified deals.
 */
export function computeEffectiveWeights(profile: WeightProfile, avail: SourceAvailability): WeightProfile {
  const raw: WeightProfile = {
    officialTransactions: profile.officialTransactions * avail.officialTransactions,
    currentMarket: profile.currentMarket * avail.currentMarket,
    marketAcceptance: profile.marketAcceptance * avail.marketAcceptance,
    marketTrend: profile.marketTrend * avail.marketTrend,
    listingSimilarity: profile.listingSimilarity * avail.listingSimilarity,
    location: profile.location * avail.location,
    propertyFeatures: profile.propertyFeatures * avail.propertyFeatures,
  };

  // Dominance guard: if official has ANY presence, acceptance can't exceed it.
  if (raw.officialTransactions > 0 && raw.marketAcceptance > raw.officialTransactions) {
    raw.marketAcceptance = raw.officialTransactions;
  }

  const sum = SOURCES.reduce((s, k) => s + raw[k], 0);
  if (sum <= 0) {
    // No usable evidence at all — fall back to property features only.
    return { officialTransactions: 0, currentMarket: 0, marketAcceptance: 0, marketTrend: 0, listingSimilarity: 0, location: 0, propertyFeatures: 100 };
  }
  const out = {} as WeightProfile;
  for (const k of SOURCES) out[k] = round1((raw[k] / sum) * 100);
  return out;
}
