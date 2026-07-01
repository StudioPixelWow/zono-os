// ============================================================================
// 🧭 Comparable Discovery Engine™ — types (client-safe, pure). VAL-QA-10.
// ----------------------------------------------------------------------------
// This engine DISCOVERS comparable evidence for a valuation — it never
// calculates a valuation, never changes the AVM/MAI/BIE/confidence formulas, and
// never fabricates evidence. It scans the WHOLE evidence universe every time
// (GovMap never short-circuits external listings), merges, dedupes, normalizes,
// ranks and explains — then hands the selected TRACEABLE comparables to the AVM.
// ============================================================================
import type { Comparable, ComparableSource } from "../types";

export const DISCOVERY_ENGINE_VERSION = "VAL-QA-10";

// Minimum-evidence policy (shared spirit with the Evidence Search Engine).
export const MIN_STRONG_COMPARABLES = 3;
export const MIN_TOTAL_COMPARABLES = 5;
export const STRONG_SIMILARITY = 65;

// Radius ladder (metres). Default valuation max = 3km; 4km only when needed.
export const RADIUS_LADDER = [500, 1000, 2000, 3000, 4000] as const;
export const DEFAULT_MAX_RADIUS_M = 3000;
export const EXPANDED_MAX_RADIUS_M = 4000;

export type DiscoverySourceId =
  | "external_listings" | "market_property_sources" | "properties"
  | "property_transactions" | "broker_sold";

export type MatchLevel = "same_city" | "normalized_city" | "radius" | "out";

export interface DiscoveryInput {
  valuationId?: string | null;
  propertyId?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  street?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  propertyType?: string | null;
  rooms?: number | null;
  sqm?: number | null;
  floor?: number | null;
  buildingYear?: number | null;
  /** Force the widest radius (else the engine escalates only when evidence is thin). */
  maxRadiusM?: number;
}

export interface DiscoverySubject {
  city: string | null; cityNormalized: string;
  neighborhood: string | null; neighborhoodNormalized: string;
  street: string | null; streetNormalized: string;
  latitude: number | null; longitude: number | null; hasCoordinates: boolean;
  propertyType: string | null; rooms: number | null; sqm: number | null;
  floor: number | null; buildingYear: number | null;
}

/** One discovered comparable candidate (pre-selection). */
export interface Candidate {
  source: DiscoverySourceId;
  sourceTable: string;
  sourceId: string | null;
  provider: string | null;
  comparableSource: ComparableSource;
  comparableType: "sold" | "listing";
  city: string | null; neighborhood: string | null; street: string | null;
  latitude: number | null; longitude: number | null; distanceMeters: number | null;
  rooms: number | null; sqm: number | null; floor: number | null; buildingYear: number | null;
  price: number | null; pricePerSqm: number | null;
  propertyType: string | null; saleDate: string | null; listingDate: string | null;
  imageUrl: string | null; originalUrl: string | null;
  similarityScore: number;             // 0..100
  radiusBucket: number | null;         // 500..4000 or null (no coords)
  matchLevel: MatchLevel;
  isTraceable: boolean;                // VAL-QA-6 contract
  usable: boolean;                     // traceable + priced + sized + in-area
  rejectionReason: string | null;
  duplicateRefs: { sourceTable: string; sourceId: string | null }[];
}

export interface SourceScanStat {
  source: DiscoverySourceId;
  table: string;
  wired: boolean;                      // read by the live valuation pipeline today
  startedAt: string; finishedAt: string; durationMs: number;
  error: string | null;
  rawRowsScanned: number;
  cityMatch: number;
  normalizedCityMatch: number;
  within500m: number; within1km: number; within2km: number; within3km: number; within4km: number;
  withPrice: number; withSqm: number; withPriceAndSqm: number;
  usableRows: number;
  rejectedRows: number;
  rejectionReasons: { reason: string; count: number }[];
}

export interface RadiusStat { radiusM: number; found: number; usable: number }

export type DiscoveryFailureMode =
  | "NO_DATA" | "NO_TRACEABLE_EVIDENCE" | "OUT_OF_AREA" | "MISSING_PRICE_OR_SQM";

export interface ComparableDiscoveryPackage {
  subject: DiscoverySubject;
  coordinatesStatus: "present" | "missing";
  maxRadiusUsedM: number;
  expandedBeyondDefault: boolean;
  sourceStats: SourceScanStat[];
  radiusStats: RadiusStat[];
  candidatePool: Candidate[];          // every scanned candidate (ranked / rejected)
  selectedComparables: Comparable[];   // top traceable usable comparables for the AVM
  totals: {
    rawScanned: number; candidates: number; duplicatesRemoved: number;
    traceable: number; usable: number; selected: number;
    strongSelected: number;
  };
  flags: {
    everySourceScanned: boolean;
    externalScanned: boolean;          // external_listings had raw rows
    externalUsed: boolean;             // an external listing was selected
    onlyOfficial: boolean;             // selected are only official transactions
  };
  selectionExplanation: string;
  failureMode: DiscoveryFailureMode | null;
  timings: { totalMs: number };
  version: string;
}
