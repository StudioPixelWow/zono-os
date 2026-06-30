// ============================================================================
// Evidence Search Engine™ v1 (Phase 24.8) — shared types. Pure, client-safe.
// This engine FINDS / NORMALIZES / RANKS / EXPLAINS evidence only. It never
// calculates a valuation and never changes AVM / MAI / confidence formulas.
// ============================================================================
import type { Comparable, ComparableSource } from "@/lib/valuation/types";

export type { Comparable, ComparableSource };

/** Progressive match levels, closest → broadest. */
export type MatchLevel =
  | "building" | "street" | "neighborhood"
  | "r300" | "r700" | "r1000" | "r2000"
  | "city" | "nearby_city";

export const MATCH_LEVELS: MatchLevel[] = ["building", "street", "neighborhood", "r300", "r700", "r1000", "r2000", "city", "nearby_city"];

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
  failureMode: FailureMode | null;
  recommendedNextStep: string;
}
