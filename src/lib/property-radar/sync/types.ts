// ============================================================================
// ZONO Property Radar™ — incremental sync types (client-safe, no I/O).
// The sync engine's vocabulary: per-listing decisions, the run input/result
// contracts, and the SyncRepository interface so the engine is decoupled from
// Supabase (real impl in repository.ts; in-memory impl used by the dev-check).
// ============================================================================
import type { PropertyProviderName } from "../types";
import type {
  NormalizedListingDetails,
  NormalizedListingMetadata,
  PropertyRadarArea,
} from "../providers/types";

// ── Per-listing decision ─────────────────────────────────────────────────────
export type SyncDecision = "new" | "updated" | "unchanged" | "missing" | "deleted" | "error";

export interface PropertySyncDecision {
  decision: SyncDecision;
  provider: PropertyProviderName;
  externalId: string;
  reason: string;
  existingSourceId?: string;
  metadata?: NormalizedListingMetadata;
  previousHash?: string | null;
  nextHash?: string | null;
}

// ── Engine input / result ────────────────────────────────────────────────────
export interface RunPropertyAreaSyncInput {
  orgId: string;
  providerName: PropertyProviderName;
  area: PropertyRadarArea;
  runType?: "automatic" | "manual" | "validation";
  options?: {
    maxPages?: number;
    unchangedStreakStopThreshold?: number;
    forceFullFetch?: boolean;
    dryRun?: boolean;
  };
}

export interface RunPropertyAreaSyncResult {
  runId: string;
  provider: PropertyProviderName;
  area: PropertyRadarArea;
  status: "success" | "partial" | "failed";
  scannedCount: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  missingCount: number;
  deletedCount: number;
  fullFetchCount: number;
  creditsUsed: number;
  creditsSavedEstimate: number;
  stopReason?: string;
  errors: string[];
  /** Decisions are always populated (handy for dryRun + debugging). */
  decisions: PropertySyncDecision[];
}

// ── Repository-facing records ────────────────────────────────────────────────
/** The subset of property_sync_sources the engine reasons over. */
export interface SyncSourceRecord {
  id: string;
  org_id: string;
  provider: string;
  external_id: string;
  source_status: string;
  content_hash: string | null;
  missing_count: number;
  price: number | null;
  published_at: string | null;
  last_seen_at: string | null;
}

export interface SyncWatermarkRecord {
  id?: string;
  org_id: string;
  provider: string;
  area_id: string | null;
  city: string | null;
  neighborhood: string | null;
  latest_external_id: string | null;
  latest_published_at: string | null;
  last_successful_scan_at: string | null;
  last_page_scanned: number | null;
  stop_reason: string | null;
}

export interface CreateSyncRunInput {
  orgId: string;
  provider: PropertyProviderName;
  /** Optional — validation runs may be org-wide rather than area-scoped. */
  area?: PropertyRadarArea;
  runType: "automatic" | "manual" | "validation";
}

// ── Missing-validation (daily) input / result ────────────────────────────────
export interface RunMissingValidationInput {
  orgId: string;
  providerName: PropertyProviderName;
  /** Optional area scope; omit to validate the whole org for this provider. */
  area?: PropertyRadarArea;
  options?: {
    /** A source not seen for this many hours becomes a candidate. Default 48. */
    missingAfterHours?: number;
    dryRun?: boolean;
  };
}

export interface RunMissingValidationResult {
  runId: string;
  provider: PropertyProviderName;
  status: "success" | "failed";
  checkedCount: number;
  missingCount: number;
  deletedCount: number;
  errors: string[];
}

export interface FinishSyncRunPatch {
  status: "success" | "partial" | "failed";
  scannedCount: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  missingCount: number;
  deletedCount: number;
  fullFetchCount: number;
  creditsUsed: number;
  creditsSavedEstimate: number;
  stopReason?: string | null;
  errorMessage?: string | null;
}

export interface UpsertWatermarkPatch {
  latestExternalId?: string | null;
  latestPublishedAt?: string | null;
  lastSuccessfulScanAt?: string | null;
  lastPageScanned?: number | null;
  stopReason?: string | null;
}

/**
 * Storage contract for the sync engine. The engine never touches Supabase
 * directly — it goes through this interface, so it can be exercised with an
 * in-memory implementation in tests / dev-checks (no DB, no credits).
 */
export interface SyncRepository {
  createSyncRun(input: CreateSyncRunInput): Promise<string>;
  finishSyncRun(runId: string, patch: FinishSyncRunPatch): Promise<void>;
  getExistingSourcesForArea(
    orgId: string,
    provider: PropertyProviderName,
    area: PropertyRadarArea,
  ): Promise<SyncSourceRecord[]>;
  getSourceByExternalId(
    orgId: string,
    provider: PropertyProviderName,
    externalId: string,
  ): Promise<SyncSourceRecord | null>;
  /**
   * Sources (status active|missing) not seen since `notSeenBeforeIso`, used by the
   * daily missing-validation pass. Optionally scoped to an area.
   */
  getStaleSources(
    orgId: string,
    provider: PropertyProviderName,
    notSeenBeforeIso: string,
    area?: PropertyRadarArea,
  ): Promise<SyncSourceRecord[]>;
  insertSourceFromMetadata(
    orgId: string,
    metadata: NormalizedListingMetadata,
    hash: string,
  ): Promise<string>;
  updateSourceSeen(
    sourceId: string,
    metadata: NormalizedListingMetadata,
    hash: string,
  ): Promise<void>;
  updateSourceFullDetails(
    sourceId: string,
    details: NormalizedListingDetails,
    hash: string,
  ): Promise<void>;
  markSourceMissing(sourceId: string): Promise<void>;
  markSourceDeleted(sourceId: string): Promise<void>;
  upsertWatermark(
    orgId: string,
    provider: PropertyProviderName,
    area: PropertyRadarArea,
    patch: UpsertWatermarkPatch,
  ): Promise<void>;
  getWatermark(
    orgId: string,
    provider: PropertyProviderName,
    area: PropertyRadarArea,
  ): Promise<SyncWatermarkRecord | null>;
}
