// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INSIGHT PORTS. Phase 2.
// ----------------------------------------------------------------------------
// Dependency-inversion seams for the insight refresh engine. Persistence is
// canonical + secret-free (no token, raw payload, signed URL; the lease token is a
// server-only nonce never surfaced in a DTO). The engine drives the sealed READ-
// ONLY insights gateway and a server credential resolver; snapshots are APPEND-
// ONLY. The durable refresh queue reuses the Batch-6.8 lease/job conventions. Real
// adapters are wired in service.ts; QA drives in-memory fakes + a mock gateway.
// ============================================================================
import type { Clock, IdGen, AuditSink } from "../connection/ports";
import type { InsightsGateway } from "./provider-types";
import type { InsightSnapshot, InsightSubjectKind } from "./domain";
import type { MetaPlatform } from "../types";

export type { Clock, IdGen, AuditSink } from "../connection/ports";

export type InsightJobKind = "object_insight_refresh" | "account_insight_refresh";
export type InsightJobStatus = "scheduled" | "available" | "claimed" | "executing" | "retry_wait" | "succeeded" | "failed" | "dead_letter" | "blocked";

export interface InsightJobRow {
  id: string; orgId: string; jobKind: InsightJobKind; subjectKind: InsightSubjectKind; subjectRef: string; platform: MetaPlatform;
  status: InsightJobStatus; priority: number; availableAtIso: string;
  attemptCount: number; maxAttempts: number; retryBudgetRemaining: number; requeueCount: number;
  leaseOwner: string | null; leaseToken: string | null; leaseExpiresAtIso: string | null; heartbeatAtIso: string | null; claimedAtIso: string | null;
  startedAtIso: string | null; completedAtIso: string | null; nextAttemptAtIso: string | null; lastErrorKind: string | null; safeLastError: string | null;
  correlationId: string; idempotencyKey: string;
}

export interface RefreshStateRow { subjectKind: InsightSubjectKind; subjectRef: string; platform: MetaPlatform; firstObservedAtIso: string | null; lastRefreshedAtIso: string | null; nextRefreshAtIso: string | null; refreshCount: number; quiesced: boolean }

export interface ObjectRef { objectExternalId: string; assetId: string; platform: MetaPlatform }
export interface AccountRef { assetExternalId: string; platform: MetaPlatform }

export interface InsightsStore {
  appendObjectSnapshots(orgId: string, providerObjectId: string, platform: MetaPlatform, snaps: readonly InsightSnapshot[], sourceJobId: string): Promise<number>;
  appendAccountSnapshots(orgId: string, assetId: string, platform: MetaPlatform, snaps: readonly InsightSnapshot[], sourceJobId: string): Promise<number>;
  getRefreshState(orgId: string, subjectKind: InsightSubjectKind, subjectRef: string): Promise<RefreshStateRow | null>;
  upsertRefreshState(orgId: string, row: RefreshStateRow): Promise<void>;
  objectRef(orgId: string, providerObjectId: string): Promise<ObjectRef | null>;
  accountRef(orgId: string, assetId: string): Promise<AccountRef | null>;
  listObjectSeries(orgId: string, providerObjectId: string): Promise<readonly InsightSnapshot[]>;
  listAccountSeries(orgId: string, assetId: string): Promise<readonly InsightSnapshot[]>;
  insertJob(row: InsightJobRow): Promise<void>;
  getJob(orgId: string, id: string): Promise<InsightJobRow | null>;
  findJobByIdem(orgId: string, key: string): Promise<InsightJobRow | null>;
  findActiveJob(orgId: string, subjectKind: InsightSubjectKind, subjectRef: string): Promise<InsightJobRow | null>;
  updateJob(row: InsightJobRow): Promise<void>;
  claimDueJobs(args: { nowMs: number; limit: number; perOrgMax: number; leaseOwner: string; leaseSeconds: number }): Promise<readonly InsightJobRow[]>;
  findStaleJobs(nowMs: number, limit: number): Promise<readonly InsightJobRow[]>;
  countInFlight(): Promise<{ global: number; perOrg: Readonly<Record<string, number>> }>;
  queueHealth(orgId: string | null, nowMs: number): Promise<{ byStatus: Readonly<Record<string, number>>; deadLetter: number; oldestDueMs: number | null }>;
}

export interface CredentialResolver { resolve(orgId: string, assetId: string): Promise<{ externalId: string; tokenPlain: string } | null> }
export interface CapabilityResolver { analyticsReadAllowed(orgId: string, assetId: string, platform: MetaPlatform): Promise<boolean> }
export interface RandomSource { fraction(): number }

export interface InsightsPorts {
  store: InsightsStore;
  gateway: InsightsGateway;
  credential: CredentialResolver;
  capability: CapabilityResolver;
  clock: Clock;
  ids: IdGen;
  audit: AuditSink;
  random: RandomSource;
}

export const DEFAULT_INSIGHT_DISPATCH_LIMIT = 8;
export const DEFAULT_INSIGHT_PER_ORG_MAX = 3;
export const DEFAULT_INSIGHT_MAX_ATTEMPTS = 6;
