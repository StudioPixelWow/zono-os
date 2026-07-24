// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · ENGAGEMENT PORTS. Phase 1.
// ----------------------------------------------------------------------------
// Dependency-inversion seams for the comment ingestion + moderation engine.
// Persistence is canonical + secret-free (no token, raw payload, signed URL; the
// lease token is a server-only nonce never surfaced in a DTO). The engine drives
// the sealed comments gateway (provider/graph/comments) and a server credential
// resolver; moderation writes go through the gateway once, never auto-retried.
// The durable queue reuses the Batch-6.8 lease/job conventions. Real adapters are
// wired in service.ts; QA drives in-memory fakes + a mock gateway.
// ============================================================================
import type { Clock, IdGen, AuditSink } from "../connection/ports";
import type { CommentsGateway } from "./provider-types";
import type { CommentRecord, ThreadRollup, ModerationKind, ModerationApprovalState, ModerationStatus } from "./domain";
import type { MetaPlatform } from "../types";

export type { Clock, IdGen, AuditSink } from "../connection/ports";

export type CommentJobKind = "comment_backfill" | "comment_sync" | "moderation_execute" | "moderation_confirm";
export type CommentJobStatus = "scheduled" | "available" | "claimed" | "executing" | "retry_wait" | "succeeded" | "failed" | "dead_letter" | "blocked";

export interface CommentJobRow {
  id: string; orgId: string; jobKind: CommentJobKind;
  providerObjectId: string | null; targetCommentId: string | null; engagementActionId: string | null; webhookEventId: string | null;
  status: CommentJobStatus; priority: number; availableAtIso: string; cursor: string | null;
  attemptCount: number; maxAttempts: number; retryBudgetRemaining: number; requeueCount: number;
  leaseOwner: string | null; leaseToken: string | null; leaseExpiresAtIso: string | null; heartbeatAtIso: string | null; claimedAtIso: string | null;
  startedAtIso: string | null; completedAtIso: string | null; nextAttemptAtIso: string | null; lastErrorKind: string | null; safeLastError: string | null;
  correlationId: string; idempotencyKey: string;
}

export interface ModerationActionRow {
  id: string; orgId: string; actionKind: ModerationKind; platform: MetaPlatform;
  targetCommentId: string; providerObjectId: string | null; replyText: string | null;
  approvalState: ModerationApprovalState; status: ModerationStatus;
  requestedBy: string | null; approvedBy: string | null; providerResultId: string | null;
  safeErrorKind: string | null; safeErrorMessage: string | null; retryable: boolean; retryClass: string | null;
  attemptCount: number; correlationId: string; idempotencyKey: string; executedAtIso: string | null;
}

/** Enough context to inspect/act on a comment via the provider. */
export interface CommentProviderRef { commentExternalId: string; platform: MetaPlatform; objectExternalId: string | null; assetId: string; status: string }
export interface ObjectProviderRef { objectExternalId: string; assetId: string; platform: MetaPlatform }

export interface EngagementStore {
  // Comments
  upsertComment(orgId: string, providerObjectId: string | null, rec: CommentRecord): Promise<{ id: string; changed: boolean }>;
  getComment(orgId: string, id: string): Promise<{ id: string; externalId: string; platform: MetaPlatform; status: string; providerObjectId: string | null } | null>;
  getCommentByExternalId(orgId: string, platform: MetaPlatform, externalId: string): Promise<{ id: string; contentFingerprint: string } | null>;
  listCommentsForObject(orgId: string, providerObjectId: string): Promise<readonly CommentRecord[]>;
  setCommentStatus(orgId: string, id: string, status: string): Promise<void>;
  upsertThread(orgId: string, providerObjectId: string | null, platform: MetaPlatform, roll: ThreadRollup): Promise<void>;
  objectRef(orgId: string, providerObjectId: string): Promise<ObjectProviderRef | null>;
  // Moderation actions
  insertAction(row: ModerationActionRow): Promise<void>;
  getAction(orgId: string, id: string): Promise<ModerationActionRow | null>;
  findActiveAction(orgId: string, targetCommentId: string, actionKind: ModerationKind): Promise<ModerationActionRow | null>;
  updateAction(row: ModerationActionRow): Promise<void>;
  moderationRef(orgId: string, actionId: string): Promise<{ action: ModerationActionRow; ref: CommentProviderRef } | null>;
  // Durable jobs (reuse 6.8 conventions)
  insertJob(row: CommentJobRow): Promise<void>;
  getJob(orgId: string, id: string): Promise<CommentJobRow | null>;
  findJobByIdem(orgId: string, key: string): Promise<CommentJobRow | null>;
  findActiveJob(orgId: string, jobKind: CommentJobKind, anchorId: string): Promise<CommentJobRow | null>;
  updateJob(row: CommentJobRow): Promise<void>;
  claimDueJobs(args: { nowMs: number; limit: number; perOrgMax: number; leaseOwner: string; leaseSeconds: number }): Promise<readonly CommentJobRow[]>;
  findStaleJobs(nowMs: number, limit: number): Promise<readonly CommentJobRow[]>;
  countInFlight(): Promise<{ global: number; perOrg: Readonly<Record<string, number>> }>;
  queueHealth(orgId: string | null, nowMs: number): Promise<{ byStatus: Readonly<Record<string, number>>; deadLetter: number; oldestDueMs: number | null }>;
}

export interface CredentialResolver { resolve(orgId: string, assetId: string): Promise<{ externalId: string; tokenPlain: string } | null> }
export interface CapabilityResolver { commentsReadAllowed(orgId: string, assetId: string, platform: MetaPlatform): Promise<boolean>; commentsModerateAllowed(orgId: string, assetId: string, platform: MetaPlatform): Promise<{ allowed: boolean; assetActive: boolean }> }
export interface RandomSource { fraction(): number }

export interface EngagementPorts {
  store: EngagementStore;
  gateway: CommentsGateway;
  credential: CredentialResolver;
  capability: CapabilityResolver;
  clock: Clock;
  ids: IdGen;
  audit: AuditSink;
  random: RandomSource;
}

/** Bounded ingestion constants (no unbounded env value feeds these). */
export const DEFAULT_COMMENT_PAGE_SIZE = 50;
export const MAX_COMMENT_PAGES_PER_JOB = 10; // bounded backfill fan-out per claim
export const DEFAULT_COMMENT_DISPATCH_LIMIT = 8;
export const DEFAULT_COMMENT_PER_ORG_MAX = 3;
export const DEFAULT_COMMENT_MAX_ATTEMPTS = 6;
