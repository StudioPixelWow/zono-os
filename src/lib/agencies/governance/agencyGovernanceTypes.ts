// ============================================================================
// ZONO — PHASE 26.14: Compliance + Data Governance Layer™ — CLIENT-SAFE types.
// Provenance, visibility, retention, audit + policy DTOs and the default policy
// set. No server-only deps, no IO. Shared by the governance service, the API
// layer and the Copilot, and unit-tested directly.
// ============================================================================

export type SourceType = "internal" | "imported" | "public" | "calculated" | "manual_review" | "ai_generated";
export type VisibilityStatus = "visible" | "limited" | "needs_review" | "hidden" | "expired";
export type LicenseStatus = "unknown" | "public" | "licensed" | "restricted";

/** Entity kinds that intelligence sources can be attached to. */
export type GovernedEntityType =
  | "agency" | "agency_match" | "agency_score" | "agency_signal" | "report"
  | "territory_stat" | "rain_node" | "rain_edge" | "copilot_answer";

export type AuditAction =
  | "create_agency" | "edit_agency" | "approve_resolution" | "reject_resolution"
  | "merge_agency" | "split_agency" | "generate_report" | "create_signal"
  | "ignore_signal" | "export_report" | "run_intelligence_job";

export interface IntelligenceSource {
  id: string;
  entityType: GovernedEntityType | string;
  entityId: string;
  sourceType: SourceType;
  sourceName: string | null;
  sourceUrl: string | null;
  collectedAt: string | null;
  lastVerifiedAt: string | null;
  confidence: number | null;       // 0..1 (null when unknown)
  licenseStatus: LicenseStatus;
  visibilityStatus: VisibilityStatus;
  retentionUntil: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  action: AuditAction | string;
  entityType: string;
  entityId: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  reason: string | null;
  createdAt: string;
}

export type PolicyKey =
  | "allow_public_sources" | "allow_imported_sources" | "allow_ai_generated_summaries"
  | "require_source_traceability" | "default_retention_days"
  | "hide_low_confidence_public_output" | "block_private_data_claims";

export interface GovernancePolicies {
  allow_public_sources: boolean;
  allow_imported_sources: boolean;
  allow_ai_generated_summaries: boolean;
  require_source_traceability: boolean;
  default_retention_days: number;
  hide_low_confidence_public_output: boolean;
  block_private_data_claims: boolean;
}

/** The compliant defaults applied when an org has no stored policy override. */
export const DEFAULT_POLICIES: GovernancePolicies = {
  allow_public_sources: true,
  allow_imported_sources: true,
  allow_ai_generated_summaries: true,
  require_source_traceability: true,
  default_retention_days: 365,
  hide_low_confidence_public_output: false,
  block_private_data_claims: true,
};

export interface VisibilityContext {
  policies: GovernancePolicies;
  now?: number;                    // ms epoch (defaults to Date.now())
}
