// ============================================================================
// ZONO Property Radar™ — Phase 12 provider QA types (client-safe, no I/O).
// Validates REAL provider data (Yad2 / Madlan via Apify) before it reaches the
// sync engine, measures normalization quality, detects schema drift + duplicates,
// and records daily provider metrics. Pure layer — never throws, never blocks.
// ============================================================================
import type { PropertyProviderName } from "../types";
import type { NormalizedListingDetails, NormalizedListingMetadata } from "../providers/types";

export type QASeverity = "low" | "medium" | "high" | "urgent";
export type ProviderQAStatus = "ok" | "warning" | "degraded";

// ── Field validation ──────────────────────────────────────────────────────────
export interface FieldValidationResult {
  valid: boolean;
  missingRequired: string[];
  missingOptional: string[];
  errors: string[];
}

// ── Normalization QA ────────────────────────────────────────────────────────
export interface NormalizationIssue {
  code: string;
  message: string;
  penalty: number;
  severity: QASeverity;
}

export interface NormalizationQAResult {
  qualityScore: number; // 0..100
  issues: NormalizationIssue[];
  /** Cleaned, safe-to-store values. */
  cleaned: {
    images: string[];
    normalizedPhone: string | null;
    listingTypeResolved: boolean;
  };
  /** 0..100 — share of tracked fields that were present + valid. */
  fieldsCompleteness: number;
}

// ── Per-listing QA report (admin screen) ─────────────────────────────────────
export interface ListingQAReport {
  provider: PropertyProviderName;
  externalId: string | null;
  accepted: boolean;
  field: FieldValidationResult;
  normalization: NormalizationQAResult;
  rawPayload: Record<string, unknown>;
  normalizedPayload: NormalizedListingMetadata | null;
}

// ── Schema drift ──────────────────────────────────────────────────────────────
export type SchemaFieldType = "string" | "number" | "boolean" | "object" | "array" | "null";
export type SchemaFingerprint = Record<string, SchemaFieldType>;

export interface SchemaChange {
  provider: PropertyProviderName;
  field: string;
  previousType: SchemaFieldType | null;
  newType: SchemaFieldType | null;
  severity: QASeverity;
}

// ── Duplicate detection ───────────────────────────────────────────────────────
export interface DuplicateSignalHit {
  phone: boolean;
  address: boolean;
  priceRooms: boolean;
  images: boolean;
  title: boolean;
}

export interface DuplicateGroup {
  /** Stable key (the chosen canonical externalId). */
  canonicalExternalId: string;
  members: { provider: PropertyProviderName; externalId: string }[];
  providers: PropertyProviderName[];
  signals: DuplicateSignalHit;
  confidence: number; // 0..1
}

// ── Batch statistics ──────────────────────────────────────────────────────────
export interface ProviderQAStatistics {
  scanned: number;
  rejected: number;
  normalizationErrors: number;
  avgQualityScore: number; // 0..100
  avgFieldsCompleteness: number; // 0..100
  missingPhones: number;
  missingImages: number;
  duplicateCount: number;
  duplicateRate: number; // 0..100
}

// ── Engine I/O ──────────────────────────────────────────────────────────────
export interface RunProviderQAInput {
  provider: PropertyProviderName;
  listings: (NormalizedListingMetadata | NormalizedListingDetails)[];
  /** Provider call latency for this batch, if known. */
  latencyMs?: number;
  creditsUsed?: number;
  creditsSaved?: number;
  /** Skip persistence (pure analysis only). */
  dryRun?: boolean;
  marketAreaKey?: string | null;
}

export interface ProviderQABatchResult {
  provider: PropertyProviderName;
  status: ProviderQAStatus;
  statistics: ProviderQAStatistics;
  /** Detailed per-listing reports (capped for memory). */
  reports: ListingQAReport[];
  schemaChanges: SchemaChange[];
  duplicates: DuplicateGroup[];
  /** True when the overall quality is healthy (>= warning threshold). */
  degraded: boolean;
  adminAlert: boolean;
  errors: string[];
}

// ── Persistence rows ──────────────────────────────────────────────────────────
export interface ProviderQADailyMetricsRow {
  provider: string;
  day: string;
  listings_scanned: number;
  listings_rejected: number;
  normalization_errors: number;
  avg_fields_completeness: number;
  avg_quality_score: number;
  avg_latency_ms: number;
  missing_phones: number;
  missing_images: number;
  duplicate_count: number;
  duplicate_rate: number;
  schema_warnings: number;
  credits_used: number;
  credits_saved: number;
  status: string;
  updated_at?: string;
}

export interface InsertSchemaEventInput {
  provider: PropertyProviderName;
  field: string;
  previousType: string | null;
  newType: string | null;
  severity: QASeverity;
  metadata?: Record<string, unknown>;
}

export interface ProviderQARepository {
  getSchemaFingerprint(provider: PropertyProviderName): Promise<SchemaFingerprint | null>;
  saveSchemaFingerprint(provider: PropertyProviderName, fields: SchemaFingerprint, sampleCount: number): Promise<void>;
  insertSchemaEvent(input: InsertSchemaEventInput): Promise<void>;
  upsertDailyMetrics(row: ProviderQADailyMetricsRow): Promise<void>;
  getLatestDailyMetrics(): Promise<ProviderQADailyMetricsRow[]>;
  getRecentSchemaEvents(limit?: number): Promise<{ provider: string; field: string; previous_type: string | null; new_type: string | null; severity: string; detected_at: string }[]>;
}

// ── Thresholds ────────────────────────────────────────────────────────────────
export const QA_WARNING_SCORE = 80; // below → admin alert
export const QA_DEGRADED_SCORE = 60; // below → provider marked degraded

export type { NormalizedListingMetadata, NormalizedListingDetails };
