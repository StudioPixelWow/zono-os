// ============================================================================
// Evidence Search Engine™ v1 (Phase 24.8) — shared types. Pure, client-safe.
// This engine FINDS / NORMALIZES / RANKS / EXPLAINS evidence only. It never
// calculates a valuation and never changes AVM / MAI / confidence formulas.
// ============================================================================
import type { Comparable, ComparableSource } from "@/lib/valuation/types";

export type { Comparable, ComparableSource };

/** Progressive match levels, closest → broadest (VAL-QA-9 market radius ladder). */
export type MatchLevel =
  | "building" | "street" | "neighborhood"
  | "r300" | "r700" | "r1500" | "r3000" | "r4000"
  | "city" | "nearby_city";

export const MATCH_LEVELS: MatchLevel[] = ["building", "street", "neighborhood", "r300", "r700", "r1500", "r3000", "r4000", "city", "nearby_city"];

/** Market-radius mode caps the widest radius the search may use. */
export type MarketRadiusMode = "conservative" | "standard" | "expanded";
export const RADIUS_MODE_MAX_M: Record<MarketRadiusMode, number> = { conservative: 1500, standard: 3000, expanded: 4000 };
export const RADIUS_STEPS_M = [300, 700, 1500, 3000, 4000] as const;

// Minimum-evidence policy (constants — never magic in the UI).
export const MIN_STRONG_COMPARABLES = 3;
export const MIN_TOTAL_COMPARABLES = 5;
export const STRONG_SIMILARITY = 65;   // similarityScore at/above this = "strong"

export type EvidenceSourceId =
  | "property_transactions" | "external_listings" | "properties"
  | "broker_sold" | "market_property_sources";

export type FailureMode =
  | "NO_GEOCODE" | "NO_COMPARABLES" | "NO_PRICED_PROPERTIES" | "NO_SQM"
  | "CITY_NOT_RESOLVED" | "ADDRESS_NOT_NORMALIZED" | "SOURCE_NOT_CONNECTED"
  | "MARKET_PROPERTY_SOURCES_NOT_WIRED" | "INSUFFICIENT_EVIDENCE" | "DATA_GAP";

export interface EvidenceSearchInput {
  propertyId?: string | null;
  valuationId?: string | null;
  rawAddress?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  street?: string | null;
  houseNumber?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  propertyType?: string | null;
  rooms?: number | null;
  sqm?: number | null;
  /** OFF by default — nearby-city evidence is never mixed silently. */
  allowNearbyCities?: boolean;
  /** Caps the widest market radius (conservative 1.5km · standard 3km · expanded 4km). Default standard. */
  marketRadiusMode?: MarketRadiusMode;
}

export interface ResolvedAddress {
  rawAddress: string | null;
  city: string | null; cityNormalized: string;
  neighborhood: string | null; neighborhoodNormalized: string;
  street: string | null; streetNormalized: string;
  houseNumber: string | null;
  latitude: number | null; longitude: number | null;
  hasCoordinates: boolean;
}

export interface EvidenceRow {
  source: EvidenceSourceId;
  sourceTable: string;           // real DB table the row came from
  externalId: string | null;     // real row id
  originalUrl: string | null;    // real public URL when available
  imageUrl: string | null;       // real image when available
  isTraceable: boolean;          // false → UNTRACEABLE_EVIDENCE, never used
  matchLevel: MatchLevel;
  distanceMeters: number | null;
  city: string | null; neighborhood: string | null; street: string | null;
  rooms: number | null; sqm: number | null;
  price: number | null; pricePerSqm: number | null;
  propertyType: string | null;
  comparableType: "sold" | "listing";
  saleDate: string | null; listingDate: string | null;
  confidence: number;            // 0..100, ranking score (not a valuation number)
  similarityScore: number;       // 0..100 relevance (distance + type + rooms + sqm + recency …)
  reason: string;
  usableForValuation: boolean;
  rejectionReason: string | null;
}

export interface SourceDiag {
  source: EvidenceSourceId;
  connected: boolean;            // table reachable
  wired: boolean;                // read by the live valuation pipeline today
  error: string | null;
  rawCount: number;
  usableCount: number;
  pricedCount: number;
  sizedCount: number;
  exactCityCount: number;
  normalizedCityCount: number;
  neighborhoodCount: number;
  radiusCount: number | null;    // null when no coordinates
  rejectedCount: number;
  rejectionReasons: string[];
}

export interface EvidencePackage {
  resolvedAddress: ResolvedAddress;
  coordinatesStatus: "present" | "missing";
  allowNearbyCities: boolean;
  sources: SourceDiag[];
  evidence: EvidenceRow[];
  /** Usable comparables for the AVM (same-city / normalized-city / radius; never
   *  nearby-city unless explicitly enabled). Shaped exactly like the valuation
   *  engine's Comparable so it can be fed in without any formula change. */
  comparablesForValuation: Comparable[];
  matchLevelsUsed: MatchLevel[];
  counts: { totalRows: number; usable: number; priced: number; sized: number; sameCity: number; normalizedCity: number; radius: number };
  /** Market-radius accounting (VAL-QA-9). */
  radius: {
    mode: MarketRadiusMode;
    maxRadiusModeM: number;        // the mode cap
    maxRadiusUsedM: number;        // the radius actually needed to reach enough evidence
    expandedBeyondDefault: boolean;
    weakDueToDistance: boolean;    // usable evidence relies mainly on far comparables
    strongUsable: number; totalUsable: number;
    perLevel: { level: MatchLevel; found: number; usable: number }[];
  };
  failureMode: FailureMode | null;
  recommendedNextStep: string;
}
