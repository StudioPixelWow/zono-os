// ============================================================================
// ZONO — Agency Scoring Engine™ (Phase 26.5). Types + PURE helpers.
// CLIENT-SAFE: no server-only deps, no IO. DATA SAFETY: every score is
// `number | null`; missing data is null (never a fabricated 0) and lowers
// confidence. The calculator/breakdown reuse these so the math is unit-testable.
// ============================================================================

export type AgencyScoreKey =
  | "marketStrength" | "growth" | "digital" | "luxury" | "inventory"
  | "coverage" | "projects" | "reputation" | "momentum" | "competitionThreat";

/** Default overall-score weights (sum = 1.00). Null components redistribute. */
export const DEFAULT_SCORE_WEIGHTS: Record<AgencyScoreKey, number> = {
  marketStrength: 0.25,
  growth: 0.15,
  inventory: 0.15,
  coverage: 0.10,
  momentum: 0.10,
  competitionThreat: 0.10,
  luxury: 0.05,
  projects: 0.05,
  digital: 0.03,
  reputation: 0.02,
};

/** Pre-computed evidence the calculator turns into scores (loaded server-side). */
export interface AgencyScoreInput {
  // Territory aggregates (Phase 26.4).
  avgDominance: number | null;   // 0..100, mean across territories
  avgMomentum: number | null;    // 0..100
  cities: number;
  neighborhoods: number;
  streets: number;
  activeListings: number;
  soldCount: number;
  dealsCount: number;
  luxuryShare: number | null;    // 0..1, max across territories
  propertyTypeDiversity: number; // distinct internal property types
  exclusiveCount: number;
  territoryStatsCount: number;
  // Graph aggregates (Phase 26.3).
  agentCount: number;
  branchCount: number;
  projectCount: number;
  developerCount: number;
  // Growth / recency proxies.
  recentSignalCount: number;
  growthEventCount: number;      // timeline events implying expansion
  // Digital footprint (profile fields — null when none stored).
  hasWebsite: boolean;
  socialLinkCount: number;       // 0..4 (fb/ig/linkedin/youtube)
  hasGooglePlace: boolean;
  digitalFieldsTracked: boolean; // whether ANY digital field exists at all
  // Reputation (real data only).
  hasReputationData: boolean;
  rating: number | null;         // 0..5
  reviewCount: number;
  // Freshness.
  dataAgeDays: number | null;    // age of newest evidence
}

/** A computed score set (pre-persist). All scores nullable. */
export interface AgencyScoreResult {
  marketStrength: number | null;
  growth: number | null;
  digital: number | null;
  luxury: number | null;
  inventory: number | null;
  coverage: number | null;
  projects: number | null;
  reputation: number | null;
  momentum: number | null;
  competitionThreat: number | null;
  overall: number | null;
  dataConfidence: number; // 0..100
  /** Per-component contribution to the overall score (effective weight × value). */
  breakdown: Record<string, { value: number | null; weight: number; contribution: number | null }>;
  /** Which components had no data (null), for auditing. */
  missing: AgencyScoreKey[];
}

export const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
export const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Average of the present (non-null) numbers, or null when none are present. */
export function meanPresent(xs: Array<number | null | undefined>): number | null {
  const v = xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Saturating normalizer: raw count → 0..100 (k = the count that maps to 50). */
export function saturate100(value: number | null | undefined, k: number): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return round1((value / (value + k)) * 100);
}
