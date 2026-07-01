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

export const DISCOVERY_ENGINE_VERSION = "27.4";   // Professional Comparable Selection Engine

// Minimum-evidence policy (shared spirit with the Evidence Search Engine).
export const MIN_STRONG_COMPARABLES = 3;
export const MIN_TOTAL_COMPARABLES = 5;
export const STRONG_SIMILARITY = 65;

// Concentric radius ladder (metres) — Phase 27.4 Part 2. Search expands ring by
// ring and stops once enough high-quality comparables exist.
export const RADIUS_LADDER = [250, 500, 750, 1000, 1500, 2000, 3000, 4000] as const;
export const DEFAULT_MAX_RADIUS_M = 3000;
export const EXPANDED_MAX_RADIUS_M = 4000;

export type DiscoverySourceId =
  | "external_listings" | "market_property_sources" | "properties"
  | "property_transactions" | "broker_sold";

// Selection source priority (Part 7) — every source is scanned; this only orders
// selection ties. Lower number = higher priority.
export const SOURCE_PRIORITY: Record<DiscoverySourceId, number> = {
  property_transactions: 1,   // official transaction
  broker_sold: 2,             // broker sold
  properties: 3,              // internal sold / inventory
  external_listings: 4,       // external active listings
  market_property_sources: 5, // portal / aggregated sources
};

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
  totalFloors?: number | null;
  buildingYear?: number | null;
  parking?: number | null;
  storage?: boolean | null;
  balcony?: number | null;      // balcony sqm
  elevator?: boolean | null;
  condition?: string | null;    // renovated / new / needs-work …
  isNew?: boolean | null;       // new build vs second-hand
  luxuryLevel?: string | null;
  houseNumber?: string | null;
  /** Force the widest radius (else the engine escalates only when evidence is thin). */
  maxRadiusM?: number;
}

export interface DiscoverySubject {
  city: string | null; cityNormalized: string;
  neighborhood: string | null; neighborhoodNormalized: string;
  street: string | null; streetNormalized: string; houseNumber: string | null;
  latitude: number | null; longitude: number | null; hasCoordinates: boolean;
  propertyType: string | null; propertyTypeNormalized: string;
  rooms: number | null; sqm: number | null;
  floor: number | null; totalFloors: number | null; buildingYear: number | null;
  parking: number | null; storage: boolean | null; balcony: number | null;
  elevator: boolean | null; condition: string | null; isNew: boolean | null; luxuryLevel: string | null;
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
  radiusBucket: number | null;         // 250..4000 or null (no coords)
  matchLevel: MatchLevel;
  isTraceable: boolean;                // VAL-QA-6 contract
  usable: boolean;                     // traceable + priced + sized + in-area
  sameType: boolean;                   // property type matches subject
  matchReasons: string[];              // Part 8 — "✓ 380m away", "✓ same rooms" …
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
  /** Part 9 — properties inside each concentric ring, per source. */
  perRadius: { radiusM: number; count: number }[];
  withPrice: number; withSqm: number; withPriceAndSqm: number;
  usableRows: number;
  rejectedRows: number;
  rejectionReasons: { reason: string; count: number }[];
}

export interface RadiusStat { radiusM: number; found: number; usable: number }

export type DiscoveryFailureMode =
  | "NO_DATA" | "NO_TRACEABLE_EVIDENCE" | "OUT_OF_AREA" | "MISSING_PRICE_OR_SQM";

// Part 10 — Comparable Quality Score.
export type QualityBand = "strong" | "moderate" | "weak";
export interface ComparableQuality {
  score: number;                 // 0..100
  band: QualityBand;
  weak: boolean;                 // score below the "weak" threshold
  label: string;                 // Hebrew label (honest when weak)
  factors: {
    distance: number; similarity: number; sourceQuality: number;
    attributeCompleteness: number; traceability: number;
  };
}

export interface ComparableDiscoveryPackage {
  subject: DiscoverySubject;
  coordinatesStatus: "present" | "missing";
  maxRadiusUsedM: number;
  expandedBeyondDefault: boolean;
  sourceStats: SourceScanStat[];
  radiusStats: RadiusStat[];
  candidatePool: Candidate[];          // every scanned candidate (ranked / rejected)
  selected: Candidate[];               // chosen candidates (with reasons) — same order as selectedComparables
  selectedComparables: Comparable[];   // top traceable usable comparables for the AVM
  quality: ComparableQuality;          // Part 10 — honest quality score
  mixedTypes: boolean;                 // had to include different property types (insufficient same-type)
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
