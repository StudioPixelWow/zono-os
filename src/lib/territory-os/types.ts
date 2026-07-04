// ============================================================================
// 🗺️ ZONO Territory Intelligence OS™ — types (client-safe). 39.0.
// The unifying command center over the EXISTING territory engines
// (market-domination 34.0, street-building-intel 34.1, market heatmap,
// exclusive-acquisition, competitor, territory). It re-implements NO scoring —
// it defines the LEAN inputs (mapped from those read models in the service) and
// the composed Territory OS output. No new engine, no schema. Approval-gated.
// ============================================================================

export const TERRITORY_OS_VERSION = "39.0";
export type Impact = "high" | "medium" | "low";
export type Priority = "high" | "medium" | "low";

// ── Lean inputs (mapped from existing engines) ──────────────────────────────
export interface AreaLean {
  key: string; name: string; city: string | null;
  score: number; band: string; marketShare: number | null;
  demand: number | null; competition: number | null; momentum: number | null;
  evidence: string[];
}
export interface ActionLean {
  areaName: string; kind: string; title: string; why: string;
  evidence: string[]; priority: number; impact: Impact; ctaHref: string; ctaLabel: string;
}
export interface PlanLean { horizon: "7d" | "30d" | "90d"; label: string; tasks: { area: string; task: string }[] }
export interface StreetLean {
  key: string; city: string | null; street: string;
  recruitmentScore: number; opportunity: Priority; transactions: number;
  marketShare: number | null; aiRecommendation: string; evidence: string[];
}
export interface BuildingLean {
  key: string; label: string; city: string | null;
  recruitmentPriority: Priority; opportunityScore: number; luxuryScore: number;
  transactions: number; evidence: string[];
}
export interface HeatLean { name: string; demand: number; supply: number; opportunity: number; heatLevel: string }

export interface TerritoryInput {
  city: string | null;
  dominationSummary: { areas: number; avgScore: number; dominant: number; contested: number; weak: number; absent: number; coverage: number };
  areas: AreaLean[];
  topOpportunities: AreaLean[];
  weakAreas: AreaLean[];
  missingAreas: AreaLean[];
  actions: ActionLean[];
  plans: PlanLean[];
  streets: StreetLean[];
  buildings: BuildingLean[];
  streetSummary: { streets: number; buildings: number; activeStreets: number; highOpportunity: number; avgRecruitment: number };
  heat: HeatLean[];
  notes: string[];
}

// ── Composed Territory OS output ────────────────────────────────────────────
export interface TerritoryScore {
  overall: number;          // 0..100 territory score (domination avg)
  coverage: number;         // 0..100
  marketShare: number;      // 0..100 average across areas
  penetration: number;      // 0..100 dominant / areas
  growth: number;           // 0..100 momentum index
  band: "dominant" | "strong" | "contested" | "weak";
  aiSummary: string;
}

export interface NeighborhoodCard {
  key: string; name: string; city: string | null; score: number; band: string;
  marketShare: number | null; demand: number | null; competition: number | null; momentum: number | null;
  heatLevel: string | null; recommendation: string | null; evidence: string[]; href: string;
}

export interface AcquisitionTarget {
  kind: "street" | "building" | "area";
  label: string; city: string | null; score: number; priority: Priority;
  why: string; evidence: string[]; ctaHref: string; ctaLabel: string;
}

export interface MarketShareView {
  dominant: { name: string; share: number | null }[];
  weak: { name: string; score: number }[];
  missing: { name: string }[];
  expansion: { name: string; why: string }[];
}

export interface ExecutiveView {
  expansion: number; penetration: number; growth: number;
  recruitment: number; domination: number; weakTerritories: number;
}

export interface CampaignSuggestion { title: string; type: string; href: string; why: string }

export interface TerritoryRecommendation { title: string; why: string; evidence: string[]; impact: Impact; ctaHref: string; ctaLabel: string }

export interface TerritoryOS {
  version: string;
  city: string | null;
  generatedAt: string;
  score: TerritoryScore;
  neighborhoods: NeighborhoodCard[];
  streets: StreetLean[];
  buildings: BuildingLean[];
  marketShare: MarketShareView;
  acquisitionPlan: AcquisitionTarget[];
  campaigns: CampaignSuggestion[];
  recommendations: TerritoryRecommendation[];
  plans: PlanLean[];
  executive: ExecutiveView;
  notes: string[];
}

// ── Broker + property integration read models ──────────────────────────────
export interface BrokerTerritorySummary {
  acquisitionStreets: { street: string; city: string | null; score: number; href: string }[];
  buildings: { label: string; city: string | null; score: number; href: string }[];
  opportunities: { title: string; why: string; href: string }[];
  marketChanges: { title: string; detail: string }[];
}

export interface PropertyTerritory {
  city: string | null; neighborhood: string | null; street: string | null;
  streetScore: number | null; buildingScore: number | null; neighborhoodScore: number | null;
  territoryImportance: Priority; coverageContribution: string; evidence: string[];
}
