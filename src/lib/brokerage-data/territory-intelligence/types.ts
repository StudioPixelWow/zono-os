// ============================================================================
// 🗺️ Territory Intelligence Engine™ — types (client-safe, pure). Phase 26.6.
// ----------------------------------------------------------------------------
// Understands WHO dominates every street / neighborhood / city, from EXISTING
// data only (external_listings + links + offices + agents). No valuation / MAI /
// discovery / broker-intelligence / office-inventory changes. Evidence only.
// ============================================================================
export const TERRITORY_VERSION = "26.6";

export type TerritoryLevel = "city" | "neighborhood" | "street";
export type DominanceBand = "Leader" | "Strong" | "Growing" | "Average" | "Weak";
export const DOMINANCE_BAND_HE: Record<DominanceBand, string> = {
  Leader: "מוביל", Strong: "חזק", Growing: "בצמיחה", Average: "ממוצע", Weak: "חלש",
};

/** One attributed listing (internal, resolved to office/broker). */
export interface AttributedListing {
  listingId: string;
  city: string | null; neighborhood: string | null; street: string | null;
  price: number | null; sqm: number | null; propertyType: string | null;
  active: boolean; rental: boolean; commercial: boolean; luxury: boolean; recent: boolean;
  officeId: string | null; officeName: string | null; brand: string | null;
  brokerId: string | null; brokerName: string | null;
  seenAt: string | null;
}

export interface CountBy { key: string; count: number }
export interface OwnerShare { id: string; name: string; brand?: string | null; active: number; total: number; sharePct: number }

export interface TerritoryStats {
  activeListings: number; historicalListings: number; totalListings: number;
  avgPrice: number | null; medianPrice: number | null; avgPricePerSqm: number | null;
  propertyTypes: CountBy[];
  luxuryPct: number; rentalPct: number; commercialPct: number;
  topOffices: OwnerShare[]; topBrokers: OwnerShare[];
}

export interface OfficeDominance {
  officeId: string; officeName: string; brand: string | null;
  dominanceScore: number; band: DominanceBand; trend: "growing" | "stable" | "declining";
  listingSharePct: number; brokerSharePct: number; activeListings: number; brokers: number;
}

export interface TerritoryNode {
  level: TerritoryLevel; key: string; name: string; parent: string | null;
  stats: TerritoryStats;
  leaderOffice: OwnerShare | null; leaderBroker: OwnerShare | null;
  officeDominance: OfficeDominance[];
  insights: string[];
}

/** Heatmap cell per territory (0..100 intensities; UI colors them). */
export interface HeatCell {
  key: string; name: string;
  officeDominance: number; brokerDominance: number; price: number; luxury: number; supply: number; activity: number;
}

export interface CityTerritoryIntelligence {
  city: string; cityNormalized: string;
  cityStats: TerritoryStats;
  neighborhoods: TerritoryNode[];
  streets: TerritoryNode[];
  heatmap: HeatCell[];
  insights: string[];
  totals: { listings: number; offices: number; brokers: number; neighborhoods: number; streets: number };
  notes: string[];
  version: string;
}

export interface AreaShare { name: string; level: TerritoryLevel; sharePct: number; dominanceScore: number; band: DominanceBand; activeListings: number }

export interface OfficeTerritoryIntelligence {
  officeId: string; officeName: string; brand: string | null;
  topNeighborhoods: AreaShare[]; topStreets: AreaShare[];
  overallActiveListings: number;
  strongAreas: AreaShare[]; weakAreas: AreaShare[]; expansionOpportunities: { name: string; level: TerritoryLevel; reason: string }[];
  insights: string[];
  version: string;
}

export interface BrokerTerritoryIntelligence {
  brokerId: string; brokerName: string;
  topNeighborhoods: AreaShare[]; topStreets: AreaShare[];
  avgPrice: number | null;
  specialties: string[];
  insights: string[];
  version: string;
}
