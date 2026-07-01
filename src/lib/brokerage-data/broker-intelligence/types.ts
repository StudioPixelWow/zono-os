// ============================================================================
// 🧠 Broker Intelligence Engine™ — types (client-safe, pure). Phase 26.5.
// ----------------------------------------------------------------------------
// A per-broker intelligence profile built from EXISTING data only (agents +
// external_listing_links + external_listings). No fake values — missing data is
// null/—. No changes to MAI / valuation / verification / discovery.
// ============================================================================
export const BROKER_INTELLIGENCE_VERSION = "26.5";

export type BrokerStatus =
  | "ACTIVE" | "RECENTLY_ACTIVE" | "LOW_ACTIVITY" | "INACTIVE" | "MOVED_OFFICE" | "UNKNOWN";

export const BROKER_STATUS_HE: Record<BrokerStatus, string> = {
  ACTIVE: "פעיל", RECENTLY_ACTIVE: "פעיל לאחרונה", LOW_ACTIVITY: "פעילות נמוכה",
  INACTIVE: "לא פעיל", MOVED_OFFICE: "עבר משרד", UNKNOWN: "לא ידוע",
};

export interface PriceStats {
  count: number;
  avgPrice: number | null; minPrice: number | null; maxPrice: number | null;
  avgSqm: number | null; avgPricePerSqm: number | null;
}

export interface BrokerIntelligenceProfile {
  id: string; name: string; normalizedName: string | null;
  currentOfficeId: string | null; currentOfficeName: string | null;
  previousOfficeId: string | null;
  confidence: number; verificationStatus: string | null;
  activeListings: number; historicalListings: number; totalListings: number; soldListings: number | null;
  sourcePortals: string[];
  phone: string | null; contactPoints: string[];
  cities: string[]; neighborhoods: string[]; propertyTypes: string[];
  priceStats: PriceStats;
  activityLevel: BrokerStatus;
  status: BrokerStatus; statusReason: string;
  lastSeenAt: string | null; firstSeenAt: string | null;
  marketAreas: string[]; specializationTags: string[];
  dataQualityScore: number;   // 0..100 from field completeness
}

/** Compact broker card for office ranking. */
export interface BrokerRankCard {
  id: string; name: string; status: BrokerStatus;
  activeListings: number; totalListings: number; recentListings: number;
  neighborhoods: number; priceVolume: number; confidence: number;
  cities: string[]; topAreas: string[];
}
