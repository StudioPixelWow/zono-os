// ============================================================================
// ZONO Property Radar™ — provider foundation contracts.
// Defines the shape every future provider (Mock / Yad2 / Madlan) must implement
// and the normalized listing shapes the radar engine consumes. NO scraping here —
// this is the interface only. Two-tier fetch model: cheap `metadata` (list scan,
// used for change detection) vs expensive `details` (full fetch, only for
// new/changed listings).
// ============================================================================
import type { ListingType, PropertyProviderName } from "../types";
import type { ProviderCapabilities } from "../connectors/types";

/** Cheap, list-level listing data — what an incremental scan returns per card. */
export interface NormalizedListingMetadata {
  provider: PropertyProviderName;
  externalId: string;
  externalUrl?: string | null;
  listingType?: ListingType;
  title?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  street?: string | null;
  addressText?: string | null;
  propertyType?: string | null;
  price?: number | null;
  rooms?: number | null;
  floor?: string | null;
  sizeSqm?: number | null;
  imageUrl?: string | null;
  phone?: string | null;
  contactName?: string | null;
  publishedAt?: string | null;
  providerUpdatedAt?: string | null;
  /** Provider-specific extra fields preserved verbatim. */
  rawMetadata?: Record<string, unknown>;
}

/** Expensive, full listing data — only fetched for new / changed listings. */
export interface NormalizedListingDetails extends NormalizedListingMetadata {
  description?: string | null;
  images?: string[];
  /** Full provider payload preserved verbatim. */
  rawFullPayload?: Record<string, unknown>;
}

/** A geographic scan target (city / neighborhood) the radar walks. */
export interface PropertyRadarArea {
  id?: string | null;
  city: string;
  neighborhood?: string | null;
  provider?: PropertyProviderName;
  /** Provider-specific area identifiers (e.g. yad2 topArea/area/city codes). */
  providerAreaCodes?: Record<string, string | number>;
}

/** Options handed to a provider scan. Controls cost + early-stop behaviour. */
export interface PropertyProviderScanOptions {
  /** Stop after this many pages regardless of stop-streak. */
  maxPages?: number;
  /** Stop once this many consecutive already-seen listings are encountered. */
  unchangedStreakStopThreshold?: number;
  /** Only return listings newer than this published-at watermark. */
  sincePublishedAt?: string | null;
  /** Last external id seen at the watermark — scan can stop when it reappears. */
  watermarkExternalId?: string | null;
  /** Abort signal for cooperative cancellation. */
  signal?: AbortSignal;
}

/** Result of a single provider list-scan (metadata only). */
export interface PropertyProviderScanResult {
  provider: PropertyProviderName;
  area: PropertyRadarArea;
  listings: NormalizedListingMetadata[];
  scannedPages: number;
  creditsUsedEstimate: number;
  stopReason?: string;
  raw?: unknown;
}

/** The contract every provider implements. */
export interface PropertyProvider {
  readonly providerName: PropertyProviderName;
  /** What this provider can do (drives engine/scoring expectations). */
  readonly capabilities: ProviderCapabilities;
  /** Cheap list scan — returns listing metadata for change detection. */
  scanAreaMetadata(
    area: PropertyRadarArea,
    options?: PropertyProviderScanOptions,
  ): Promise<PropertyProviderScanResult>;
  /** Expensive full fetch — only called for new / changed listings. */
  fetchListingDetails(
    externalId: string,
    externalUrl?: string | null,
  ): Promise<NormalizedListingDetails>;
}
