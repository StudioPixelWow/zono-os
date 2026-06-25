// ============================================================================
// ZONO Property Radar™ — Phase 10 buyer-matching types (client-safe, no I/O).
// The matching engine is DETERMINISTIC and FAST: a cheap fast-filter eliminates
// >90% of buyers before any scoring runs, so it scales to tens of thousands of
// buyers without AI. AI may later enrich `explanation` only — never the scores.
// ============================================================================
import type { NormalizedListingDetails, NormalizedListingMetadata } from "../providers/types";

// ── Enums ─────────────────────────────────────────────────────────────────────
export type MatchLevel = "perfect" | "excellent" | "good" | "possible" | "rejected";
export type MatchStatus = "new" | "viewed" | "contacted" | "dismissed" | "converted";

/** A buyer flattened into exactly the fields the matcher needs (storage-agnostic). */
export interface MatchableBuyer {
  id: string;
  orgId: string;
  fullName: string;
  phone: string | null;
  /** "active" buyers are matched; inactive/closed/archived are filtered out. */
  status: "active" | "inactive" | "closed" | "archived" | string;
  temperature: "hot" | "warm" | "cold" | null;
  budgetMin: number | null;
  budgetMax: number | null;
  roomsMin: number | null;
  roomsMax: number | null;
  sizeMin: number | null;
  sizeMax: number | null;
  preferredTypes: string[];
  /** Cities the buyer is interested in (from preferred_areas). */
  preferredCities: string[];
  preferredNeighborhoods: string[];
  mustHaveParking: boolean;
  mustHaveBalcony: boolean;
  floorMin: number | null;
  floorMax: number | null;
  /** immediate | soon | flexible — drives the timeline dimension. */
  timeline: "immediate" | "soon" | "flexible" | null;
  lastContactedAt: string | null;
  /** Manual operator overrides applied on top of the deterministic score. */
  manualBonus: number;
  manualPenalty: number;
}

/** A market property flattened for matching (parsed from a normalized listing). */
export interface MatchableProperty {
  sourceId: string;
  city: string | null;
  neighborhood: string | null;
  price: number | null;
  rooms: number | null;
  propertyType: string | null;
  sizeSqm: number | null;
  /** Parsed integer floor, or null if unknown. */
  floorNumber: number | null;
  /** Best-effort from raw metadata; null = unknown (never a hard rejection). */
  hasParking: boolean | null;
  hasBalcony: boolean | null;
}

// ── Scoring ────────────────────────────────────────────────────────────────────
export interface MatchWeights {
  budget: number;
  location: number;
  rooms: number;
  propertyType: number;
  size: number;
  parking: number;
  balcony: number;
  floor: number;
  timeline: number;
}

export interface MatchScoreBreakdown {
  priceScore: number;
  locationScore: number;
  roomsScore: number;
  propertyTypeScore: number;
  sizeScore: number;
  parkingScore: number;
  balconyScore: number;
  floorScore: number;
  timelineScore: number;
}

// ── Fast filter ─────────────────────────────────────────────────────────────────
export interface FastFilterConfig {
  enforceActive: boolean;
  enforceCity: boolean;
  enforceBudget: boolean;
  enforcePropertyType: boolean;
  /** Allow price up to this fraction ABOVE budget_max before rejecting (0.05 = 5%). */
  budgetOverMaxTolerance: number;
  /** Allow price down to this fraction BELOW budget_min before rejecting. */
  budgetUnderMinTolerance: number;
  /** Buyer statuses considered matchable. */
  activeStatuses: string[];
}

export interface FastFilterResult {
  passed: boolean;
  rejectionCode?: "inactive" | "wrong_city" | "budget" | "property_type";
  rejectionReason?: string;
}

// ── Explanation (AI-pluggable) ───────────────────────────────────────────────────
export interface MatchExplanation {
  positives: string[];
  negatives: string[];
  summary: string;
  /** "deterministic" today; a future AI layer may set "ai" without touching scores. */
  generatedBy: "deterministic" | "ai";
}

export interface MatchExplanationContext {
  buyer: MatchableBuyer;
  property: MatchableProperty;
  breakdown: MatchScoreBreakdown;
  weights: MatchWeights;
  score: number;
  level: MatchLevel;
  rejection?: FastFilterResult;
}

/** Pluggable explainer — deterministic impl is the default; AI can implement later. */
export interface MatchExplainer {
  explain(ctx: MatchExplanationContext): MatchExplanation;
}

// ── Engine I/O ────────────────────────────────────────────────────────────────
export interface MatchEngineInput {
  property: MatchableProperty;
  buyers: MatchableBuyer[];
  weights?: MatchWeights;
  filterConfig?: FastFilterConfig;
  explainer?: MatchExplainer;
  /** Include rejected buyers in the output (default false — only relevant kept). */
  includeRejected?: boolean;
}

export interface BuyerMatch {
  buyerId: string;
  buyer: MatchableBuyer;
  matchScore: number;
  matchLevel: MatchLevel;
  breakdown: MatchScoreBreakdown;
  manualBonus: number;
  manualPenalty: number;
  explanation: MatchExplanation;
  rejected: boolean;
}

export interface MatchEngineResult {
  /** Relevant (non-rejected) matches, sorted by score desc. */
  matches: BuyerMatch[];
  evaluatedCount: number;
  filteredOutCount: number;
  relevantCount: number;
  perfectCount: number;
  excellentCount: number;
}

// ── Repository contract (server impl in repository.ts; in-memory in dev-check) ──
export interface UpsertMatchInput {
  orgId: string;
  buyerId: string;
  marketPropertySourceId: string;
  linkedPropertyId?: string | null;
  matchScore: number;
  matchLevel: MatchLevel;
  breakdown: MatchScoreBreakdown;
  manualBonus: number;
  manualPenalty: number;
  explanation: MatchExplanation;
}

export interface UpsertMatchResult {
  matchId: string;
  created: boolean;
  scoreChanged: boolean;
}

export interface PerfectMatchTaskInput {
  orgId: string;
  buyerId: string;
  marketPropertySourceId: string;
  buyerName: string;
  /** End-of-today ISO due date. */
  dueAtIso: string;
  matchScore: number;
}

export interface StoredBuyerMatch {
  id: string;
  buyerId: string;
  buyerName: string;
  phone: string | null;
  matchScore: number;
  matchLevel: MatchLevel;
  status: MatchStatus | string;
  budgetMin: number | null;
  budgetMax: number | null;
  lastContactedAt: string | null;
  positives: string[];
  negatives: string[];
  marketPropertySourceId: string;
}

/**
 * Everything the matching engine + fan-out + UI need from storage. The fan-out
 * uses a subset (buyers + upsert + task); the market engine uses
 * markMatchesInactiveForSource; the panel uses getTopMatchesForSource.
 */
export interface MatchingRepository {
  getActiveBuyersForOrg(orgId: string): Promise<MatchableBuyer[]>;
  upsertBuyerPropertyMatch(input: UpsertMatchInput): Promise<UpsertMatchResult>;
  markMatchesInactiveForSource(marketPropertySourceId: string): Promise<number>;
  /**
   * Keep only `relevantBuyerIds` active for (org, source); deactivate the rest.
   * Used by the daily refresh so buyers who are no longer relevant are dropped.
   * Returns the number deactivated.
   */
  reconcileActiveMatches(orgId: string, marketPropertySourceId: string, relevantBuyerIds: string[]): Promise<number>;
  perfectMatchTaskExists(orgId: string, buyerId: string, marketPropertySourceId: string): Promise<boolean>;
  createPerfectMatchTask(input: PerfectMatchTaskInput): Promise<void>;
  getTopMatchesForSource(orgId: string, marketPropertySourceId: string, limit?: number): Promise<StoredBuyerMatch[]>;
  countRelevantMatchesForSource(orgId: string, marketPropertySourceId: string): Promise<number>;
  updateMatchStatus(orgId: string, matchId: string, status: MatchStatus): Promise<void>;
}

/** The subset the market fan-out + engine depend on (keeps coupling minimal). */
export type MatchingPort = MatchingRepository;

// Re-export normalized listing types for convenience.
export type { NormalizedListingDetails, NormalizedListingMetadata };
