// ============================================================================
// 🗺️ ZONO — Geo Intelligence / Smart Map — types (pure). 32.4.
// ----------------------------------------------------------------------------
// Multi-layer geographic intelligence for the broker. One map, many switchable
// heat layers — each recolours the areas by a different metric with its own
// colour scale + legend. Evidence-first: real market aggregates where available,
// clearly-marked derived estimates for the rest, structured mock only when the
// org has no data yet. Nothing here touches the shared ZonoMap component.
// ============================================================================

export const GEO_INTEL_VERSION = "32.4";

export type GeoLevel = "city" | "neighborhood" | "street";

/** Every metric a Smart-Map layer can colour by. */
export interface GeoMetrics {
  avgPrice: number | null;          // ₪ average listing price
  pricePerSqm: number | null;       // ₪ per m²
  activeListings: number;           // active properties in the area
  supply: number;                   // 0..100 supply pressure
  demandScore: number;              // 0..100 demand (views/saves/leads/matches)
  transactions: number;             // closed deals in the period
  exclusivityPct: number;           // 0..100 share held under exclusivity
  daysOnMarket: number;             // avg days to sell
  priceGrowthPct: number;           // signed % price change
  recruitmentScore: number;         // 0..100 opportunity to win exclusivity
  adRoiScore: number;               // 0..100 advertising ROI potential
  newListings: number;              // properties added in the period
  priceReductions: number;          // count / share of price drops
  investorActivity: number;         // 0..100 investor concentration
}

export type GeoMetricKey = keyof GeoMetrics;

/** One geographic area (city / neighborhood / street) with all metrics. */
export interface GeoArea {
  id: string;
  name: string;
  level: GeoLevel;
  city: string | null;
  neighborhood: string | null;
  street: string | null;
  propertyTypes: string[];          // property types present (for filtering)
  metrics: GeoMetrics;
  /** Human, traceable reasons behind the opportunity picture. */
  reasons: string[];
  /** Short, evidence-based AI recommendation for this area. */
  aiRecommendation: string;
  /** True when some metrics are derived estimates rather than measured. */
  derived: boolean;
  /** True when the whole area is structured mock (org has no data yet). */
  mock: boolean;
}

/** A selectable heat layer definition. */
export interface HeatLayer {
  id: string;
  label: string;
  icon: string;                     // Icon-registry name
  description: string;
  metricKey: GeoMetricKey;
  legend: string[];                 // low → high buckets (RTL reads right→left)
  colorScale: string[];            // hex ramp, low → high
  format: "shekel" | "shekel_sqm" | "count" | "score" | "percent" | "signed_percent" | "days";
  /** Higher value = "hotter"/better for this layer (drives insight wording). */
  higherIsBetter: boolean;
}

export interface GeoFilters {
  city: string | null;
  neighborhood: string | null;
  street: string | null;
  propertyType: string | null;
  roomsMin: number | null;
  priceMin: number | null;
  priceMax: number | null;
  period: "30d" | "90d" | "180d" | "365d";
}

export interface GeoInsight { title: string; body: string; layerId: string | null }

export interface GeoIntelligence {
  version: string;
  generatedAt: string;
  areas: GeoArea[];
  insights: GeoInsight[];
  dataMode: "real" | "partial" | "mock" | "empty";
  notes: string[];
}
