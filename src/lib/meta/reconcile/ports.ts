// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · RECONCILIATION PORTS. Phase 3C.
// ----------------------------------------------------------------------------
// Dependency-inversion seams for the reconciliation queue engine. Persistence is
// canonical + secret-free (no token, signed URL, raw payload, media bytes; the
// lease token is a server-only nonce never surfaced in a DTO). The engine drives
// the sealed READ-ONLY inspection gateway (provider/graph/inspect) and a server
// credential resolver; it NEVER publishes/edits/deletes. Real adapters (Supabase
// store with the SKIP LOCKED claim, the Graph inspection gateway, audit, clock,
// ids, injected random) are wired in service.ts; QA drives in-memory fakes.
// ============================================================================
import type { Clock, IdGen, AuditSink } from "../connection/ports";
import type { InspectionGateway, ProviderObjectState } from "./provider-types";
import type { DiscrepancyType, DiscrepancySeverity } from "./drift";
import type { ReconcileJobKind } from "./decision";

export type { Clock, IdGen, AuditSink } from "../connection/ports";

export type ReconcileJobStatus = "scheduled" | "available" | "claimed" | "executing" | "retry_wait" | "verified" | "discrepancy_found" | "unresolved" | "cancelled" | "dead_letter";

export interface ReconcileJobRow {
  id: string; orgId: string; jobKind: ReconcileJobKind;
  publishOperationId: string | null; publishTargetId: string | null; providerObjectId: string | null; deadLetterId: string | null; webhookEventId: string | null;
  status: ReconcileJobStatus; reason: string | null; priority: number;
  availableAtIso: string; attemptCount: number; maxAttempts: number; confirmationCount: number;
  leaseOwner: string | null; leaseToken: string | null; leaseExpiresAtIso: string | null; heartbeatAtIso: string | null; claimedAtIso: string | null;
  startedAtIso: string | null; completedAtIso: string | null; nextAttemptAtIso: string | null; safeErrorKind: string | null;
  correlationId: string; idempotencyKey: string;
}

export interface ReconcileAttemptRow {
  id: string; orgId: string; reconciliationJobId: string; publishOperationId: string | null; publishTargetId: string | null; providerObjectId: string | null;
  attemptNumber: number; initiatedBy: string | null; initiationKind: "automatic" | "webhook" | "manual" | "recovery";
  startedAtIso: string; completedAtIso: string | null; result: string | null; observedProviderState: string | null; safeErrorKind: string | null; retryClass: string | null; providerRequestId: string | null; durationMs: number | null; correlationId: string | null;
}

export interface ObjectStateRow {
  id: string; orgId: string; providerObjectId: string; observedAtIso: string; state: ProviderObjectState; visibilityState: string | null;
  providerCreatedTime: string | null; providerUpdatedTime: string | null; permalink: string | null; externalParentId: string | null;
  evidenceKind: "provider_inspection" | "webhook" | "manual" | "recovery" | "publish_confirmation"; sourceEventId: string | null; sourceReconciliationAttemptId: string | null; contentFingerprint: string | null; safeMetadata: Record<string, unknown>;
}

export interface DiscrepancyRow {
  id: string; orgId: string; publishOperationId: string | null; publishTargetId: string | null; providerObjectId: string | null;
  discrepancyType: DiscrepancyType; severity: DiscrepancySeverity; status: "open" | "monitoring" | "resolved" | "acknowledged" | "false_positive";
  detectedAtIso: string; lastConfirmedAtIso: string | null; evidenceCount: number; safeSummary: string | null; autoRepairable: boolean;
  repairedAtIso: string | null; repairedBy: string | null; resolution: string | null; resolvedBy: string | null; resolutionReason: string | null;
}

/** Canonical (secret-free) target snapshot the decision engine reads. */
export interface TargetSnapshot { orgId: string; operationId: string; status: string; assetId: string; platform: "facebook" | "instagram"; contentKind: string; providerObjectId: string | null; providerContainerId: string | null; permalink: string | null; publishedAtMs: number | null }

export interface ReconcileStore {
  insertJob(row: ReconcileJobRow): Promise<void>;
  getJob(orgId: string, id: string): Promise<ReconcileJobRow | null>;
  findJobByIdem(orgId: string, key: string): Promise<ReconcileJobRow | null>;
  findActiveJob(orgId: string, jobKind: ReconcileJobKind, anchorId: string): Promise<ReconcileJobRow | null>;
  updateJob(row: ReconcileJobRow): Promise<void>;
  claimDueJobs(args: { nowMs: number; limit: number; perOrgMax: number; leaseOwner: string; leaseSeconds: number }): Promise<readonly ReconcileJobRow[]>;
  findStaleJobs(nowMs: number, limit: number): Promise<readonly ReconcileJobRow[]>;
  countInFlight(): Promise<{ global: number; perOrg: Readonly<Record<string, number>> }>;
  insertAttempt(row: ReconcileAttemptRow): Promise<void>;
  listAttempts(orgId: string, jobId: string): Promise<readonly ReconcileAttemptRow[]>;
  appendObjectState(row: ObjectStateRow): Promise<void>;
  listObjectStates(orgId: string, providerObjectId: string): Promise<readonly ObjectStateRow[]>;
  upsertDiscrepancy(row: DiscrepancyRow): Promise<DiscrepancyRow>;
  getDiscrepancy(orgId: string, id: string): Promise<DiscrepancyRow | null>;
  listDiscrepancies(orgId: string): Promise<readonly DiscrepancyRow[]>;
  updateDiscrepancy(row: DiscrepancyRow): Promise<void>;
  resolveOpenDiscrepancies(orgId: string, targetId: string, resolution: string): Promise<number>;
  // Canonical target/mapping access (read + narrow safe repairs).
  getTargetSnapshot(orgId: string, targetId: string): Promise<TargetSnapshot | null>;
  countMappingsForTarget(orgId: string, targetId: string): Promise<number>;
  createProviderObjectMapping(input: { orgId: string; operationId: string; targetId: string; platform: string; assetId: string; providerObjectType: string; externalObjectId: string; externalContainerId: string | null; permalink: string | null }): Promise<string>;
  markTargetPublished(orgId: string, targetId: string, providerObjectId: string, permalink: string | null): Promise<void>;
  updateProviderObjectPermalink(orgId: string, providerObjectId: string, permalink: string): Promise<void>;
  setTargetManualRetryEligible(orgId: string, targetId: string): Promise<void>;
  setTargetVerified(orgId: string, targetId: string, state: string): Promise<void>;
  queueHealth(orgId: string | null, nowMs: number): Promise<{ byStatus: Readonly<Record<string, number>>; deadLetter: number; oldestDueMs: number | null; unresolved: number }>;
}

export interface CredentialResolver { resolve(orgId: string, assetId: string): Promise<{ externalId: string; tokenPlain: string } | null> }
export interface RandomSource { fraction(): number }

export interface ReconcilePorts {
  store: ReconcileStore;
  inspect: InspectionGateway;
  credential: CredentialResolver;
  clock: Clock;
  ids: IdGen;
  audit: AuditSink;
  random: RandomSource;
}

export const DEFAULT_RECONCILE_DISPATCH_LIMIT = 8;
export const DEFAULT_RECONCILE_PER_ORG_MAX = 3;
export const DEFAULT_RECONCILE_MAX_ATTEMPTS = 6;
