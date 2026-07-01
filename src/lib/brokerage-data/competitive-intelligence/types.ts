// ============================================================================
// ⚔️ Brokerage Competitive Intelligence Engine™ — types (client-safe, pure). 26.7.
// ----------------------------------------------------------------------------
// Analyzes every office against every competitor from EXISTING evidence only
// (attributed listings from Territory Intelligence). No valuation / MAI /
// discovery / verification / territory / broker-intel / office-inventory changes.
// Never fabricates trends — growth/decline come from real listing dates.
// ============================================================================
export const COMPETITIVE_VERSION = "26.7";

export type Momentum = "growing" | "stable" | "declining";
export type ThreatLevel = "low" | "moderate" | "high";
export type ConcentrationLevel = "fragmented" | "moderate" | "concentrated";

export interface OfficeAggregate {
  officeId: string; officeName: string; brand: string | null;
  activeListings: number; totalListings: number; brokers: number;
  neighborhoods: string[]; streets: number;
  luxury: number; commercial: number; rental: number;
  avgPrice: number | null; avgPricePerSqm: number | null;
  recent60: number; prior60: number; growthPct: number; momentum: Momentum;
  listingSharePct: number; brokerSharePct: number; brokerDensity: number;
  rank: number;
}

export interface MarketSnapshot {
  city: string;
  activeOffices: number; verifiedOffices: number; activeBrokers: number; activeListings: number;
  inventoryTrendPct: number;                 // city recent-60 vs prior-60
  avgOfficeSize: number; avgBrokerActivity: number;
  marketConcentration: number;               // HHI 0..10000
  concentrationLevel: ConcentrationLevel; topOfficeSharePct: number;
}

export interface CompetitorRef { officeId: string; officeName: string; brand: string | null; value: number; note: string }

export interface CompetitiveMatrix {
  mainCompetitors: CompetitorRef[];
  closestCompetitors: CompetitorRef[];       // most overlapping neighborhoods
  fastestGrowing: CompetitorRef[];
  largestInventory: CompetitorRef[];
  highestLuxury: CompetitorRef[];
  highestCommercial: CompetitorRef[];
  highestCoverage: CompetitorRef[];
  highestBrokerDensity: CompetitorRef[];
}

export interface SwotItem { text: string; evidence: string }
export interface Swot { strengths: SwotItem[]; weaknesses: SwotItem[]; opportunities: SwotItem[]; threats: SwotItem[] }

export interface Opportunity { title: string; area: string | null; reason: string; evidence: string }

export interface StrategicInsight { text: string; evidence: string }

export interface OfficeCompetitiveProfile {
  officeId: string; officeName: string; brand: string | null;
  marketRank: number; totalOffices: number;
  listingSharePct: number; brokerSharePct: number;
  activeListings: number; brokers: number; neighborhoods: number;
  luxurySharePct: number; commercialSharePct: number; rentalSharePct: number;
  avgPrice: number | null; avgPricePerSqm: number | null;
  growthPct: number; momentum: Momentum; threatLevel: ThreatLevel;
  competitors: CompetitiveMatrix;
  swot: Swot;
  opportunities: Opportunity[];
  insights: StrategicInsight[];
  rankExplanation: string;
  version: string;
}

export interface CityCompetitiveDashboard {
  city: string; cityNormalized: string;
  snapshot: MarketSnapshot;
  topOffices: OfficeAggregate[];
  topGrowing: OfficeAggregate[];
  topDeclining: OfficeAggregate[];
  topBrokers: { id: string; name: string; active: number }[];
  largestInventories: OfficeAggregate[];
  highestLuxuryShare: CompetitorRef[];
  highestCommercialShare: CompetitorRef[];
  marketLeaders: OfficeAggregate[];
  emergingAreas: Opportunity[];
  insights: StrategicInsight[];
  notes: string[];
  version: string;
}
