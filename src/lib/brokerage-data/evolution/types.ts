// ============================================================================
// ZONO Brokerage Evolution Intelligence™ — pure types (client-safe).
// Historical/temporal layer over the brokerage knowledge graph. Mirrors
// supabase/migrations/20260805120000_brokerage_evolution.sql.
// ============================================================================

export type SnapshotEntityType = "office" | "agent" | "neighborhood" | "city" | "network" | "market";
export type SnapshotPeriod = "day" | "week" | "month" | "year";
export type DnaEntityType = "office" | "agent";
export type CompetitionLevel = "low" | "medium" | "high";
export type PredictionType =
  | "office_growth" | "office_decline" | "branch_expansion" | "office_closure" | "agent_movement" | "specialization_change";

// ── Listing profile (DNA input) ─────────────────────────────────────────────
export interface ListingProfile {
  propertyType?: string | null;
  price?: number | null;
  dealType?: string | null;     // sale | rent
  city?: string | null;
  neighborhood?: string | null;
}

// ── DNA output ──────────────────────────────────────────────────────────────
export interface EntityDNA {
  primarySpecialization: string;
  propertyTypes: { category: string; pct: number }[];
  priceMin: number | null;
  priceMax: number | null;
  avgValue: number | null;
  luxuryPct: number;
  projectsPct: number;
  secondhandPct: number;
  commercialPct: number;
  rentalsPct: number;
  cities: string[];
  neighborhoods: string[];
  digitalPresence: number;       // 0..100
  growthPattern: "growing" | "stable" | "declining" | "unknown";
  riskIndicators: string[];
  clientProfile: string;
  confidence: number;            // 0..100
  evidence: string[];
}

// ── Agent career ────────────────────────────────────────────────────────────
export interface CareerInput {
  firstSeen: string | null;
  lastSeen: string | null;
  activitySeries: { date: string; listings: number }[];
  officeChanges: number;
  inactiveGaps: number;
  specialization?: string;
}
export interface CareerProfile {
  experienceMonths: number;
  careerScore: number;           // 0..100
  stabilityScore: number;        // 0..100
  growthScore: number;           // 0..100 (50 = flat)
  expertise: string[];
  explanation: string;
}

// ── Neighborhood dominance ──────────────────────────────────────────────────
export interface NeighborhoodInput {
  city: string; neighborhood: string;
  offices: { id: string; label: string; listings: number }[];
  agents: { id: string; label: string; listings: number }[];
  totalListings: number; avgPrice: number | null;
  priceTrend: number; activityTrend: number;
}
export interface NeighborhoodDominance {
  leadingOfficeId: string | null; leadingAgentId: string | null;
  listingVolume: number; avgPrice: number | null; competitionLevel: CompetitionLevel;
  concentration: number; marketShare: number; coveragePct: number; growth: number; confidence: number;
}

// ── Market DNA (per city) ───────────────────────────────────────────────────
export interface MarketDnaInput {
  city: string; offices: number; agents: number; listings: number;
  luxuryPct: number; developerPct: number; categoryShares: Record<string, number>;
  officeShares: number[]; volatility: number; avgConfidence: number; growthTrend: number;
}
export interface MarketDNA {
  dominantOfficeCategory: string; dominantPropertyCategory: string;
  competitionIntensity: number; growthTrend: number; luxuryConcentration: number;
  developerConcentration: number; officeDensity: number; agentDensity: number;
  volatility: number; avgConfidence: number;
}

// ── Growth + prediction ─────────────────────────────────────────────────────
export interface GrowthRow { key: string; label: string; entityType: string; city: string | null; prev: number; curr: number; deltaPct: number }
export interface PredictionResult { likelihood: number; confidence: number; slope: number; evidence: string[]; explanation: string }

// ── Change detection ────────────────────────────────────────────────────────
export interface EvolutionEvent { eventType: string; title: string; detail: string | null; field: string | null; oldValue: string | null; newValue: string | null }
