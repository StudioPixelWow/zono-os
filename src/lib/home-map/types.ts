// ============================================================================
// ZONO — Home live-property map types (Phase 24.6, client-safe). DTOs for the
// Home Dashboard "מפת הנכסים החיה" — real internal + external properties with
// real coordinates only. No fake heat, no invented coordinates.
// ============================================================================

export type MapScope = "all" | "internal" | "external";
export type MapDeal = "all" | "sale" | "rent";
export type MapSource = "all" | "yad2" | "madlan" | "manual";
export type MapPropertyType = "all" | "apartment" | "house" | "commercial" | "land";

export interface HomeMapFilters {
  scope: MapScope;
  deal: MapDeal;
  source: MapSource;
  propertyType: MapPropertyType;
  priceMin: number | null;
  priceMax: number | null;
  newOnly: boolean;       // listed in the last 14 days
  privateOnly: boolean;   // external private-owner listings (no agent)
  city: string | null;    // narrow to one operating-area city
}

export const DEFAULT_HOME_MAP_FILTERS: HomeMapFilters = {
  scope: "all", deal: "all", source: "all", propertyType: "all",
  priceMin: null, priceMax: null, newOnly: false, privateOnly: false, city: null,
};

export interface HomeMapPoint {
  id: string;
  lat: number;
  lng: number;
  title: string;
  details: string[];
  origin: "internal" | "external";
  source: string | null;   // yad2 / madlan / manual / internal
  href: string | null;
}

export interface HomeMapData {
  points: HomeMapPoint[];
  internalCount: number;
  externalCount: number;
  total: number;
  hasGoogleKey: boolean;
  hasOperatingArea: boolean;
  areaCities: string[];     // operating-area cities (for the locality filter)
  areaLabel: string | null; // short label, e.g. "תל אביב, רמת גן"
}
