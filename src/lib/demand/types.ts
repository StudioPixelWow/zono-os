// ============================================================================
// ZONO Buyer Demand Intelligence — shared types (client-safe).
// ============================================================================

export type DemandBand = "hot" | "strong" | "active" | "low";
export type GapBand = "critical" | "very_high" | "high" | "medium" | "low";

/** Real buyer row (only the fields the demand engine reads). */
export interface BuyerRow {
  id: string;
  full_name?: string | null;
  temperature?: "hot" | "warm" | "cold" | null;
  budget_min?: number | null;
  budget_max?: number | null;
  rooms_min?: number | null;
  rooms_max?: number | null;
  preferred_types?: string[] | null;
  preferred_areas?: string[] | null;
  preferred_regions?: string[] | null;
  has_preapproval?: boolean | null;
  readiness?: number | null;
  last_contacted_at?: string | null;
  must_have_parking?: boolean | null;
  must_have_elevator?: boolean | null;
  must_have_safe_room?: boolean | null;
}

/** Real inventory row (only the fields used for gap matching). */
export interface PropertyRow {
  id: string;
  city?: string | null;
  neighborhood?: string | null;
  property_type?: string | null;
  rooms?: number | null;
  price?: number | null;
  status?: string | null;
  is_active?: boolean | null;
  is_internal_inventory?: boolean | null;
}

export interface DemandReason {
  label: string;
  detail: string;
  weight?: number;
}

export interface BuyerDemandProfile {
  buyerId: string;
  preferredCities: string[];
  preferredNeighborhoods: string[];
  propertyTypes: string[];
  roomsMin: number | null;
  roomsMax: number | null;
  budgetMin: number | null;
  budgetMax: number | null;
  urgencyScore: number;
  financingReadinessScore: number;
  searchActivityScore: number;
  engagementScore: number;
  demandScore: number;
  demandBand: DemandBand;
  reasons: DemandReason[];
}

export interface ClusterBuyerLink {
  buyerId: string;
  fitScore: number;
  isHot: boolean;
}

export interface DemandCluster {
  clusterKey: string;
  label: string;
  area: string;
  scope: "city" | "neighborhood";
  propertyType: string;
  roomsBucket: number;
  budgetCeiling: number;
  activeBuyers: number;
  hotBuyers: number;
  avgBudget: number;
  urgencyScore: number;
  demandStrength: number;
  demandBand: DemandBand;
  inventoryCount: number;
  gapScore: number;
  gapBand: GapBand;
  reasons: DemandReason[];
  buyers: ClusterBuyerLink[];
}

export interface AcquisitionSignal {
  clusterKey: string;
  signalType: "inventory_shortage";
  title: string;
  area: string;
  scope: string;
  propertyType: string;
  roomsBucket: number;
  budgetCeiling: number;
  buyersCount: number;
  hotBuyersCount: number;
  inventoryCount: number;
  gapScore: number;
  urgencyScore: number;
  strength: number;
  competition: number;
  reasons: DemandReason[];
}

export interface HeatmapCell {
  scope: "locality" | "neighborhood" | "property_type";
  key: string;
  label: string;
  buyersCount: number;
  hotBuyers: number;
  avgBudget: number | null;
  demandStrength: number;
  inventoryCount: number;
  gapScore: number;
}

// ── Hebrew labels ────────────────────────────────────────────────────────────
export const DEMAND_BAND_LABEL: Record<DemandBand, string> = {
  hot: "ביקוש לוהט",
  strong: "ביקוש חזק",
  active: "ביקוש פעיל",
  low: "ביקוש נמוך",
};

export const GAP_BAND_LABEL: Record<GapBand, string> = {
  critical: "חוסר קריטי",
  very_high: "חוסר גבוה מאוד",
  high: "חוסר גבוה",
  medium: "חוסר בינוני",
  low: "מאוזן",
};

export const PROPERTY_TYPE_HE: Record<string, string> = {
  apartment: "דירה",
  garden_apartment: "דירת גן",
  penthouse: "פנטהאוז",
  duplex: "דופלקס",
  private_house: "בית פרטי",
  cottage: "קוטג'",
  studio: "סטודיו",
  commercial: "מסחרי",
  office: "משרד",
  land: "מגרש",
  other: "אחר",
};
