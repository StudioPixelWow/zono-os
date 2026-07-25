// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INBOX PORTS. Phase 3.
// ----------------------------------------------------------------------------
// Dependency-inversion seams for the unified-inbox sync engine + state layer. The
// inbox is a LOCAL projection over already-ingested canonical comment data — there
// is NO provider gateway and NO Graph call here (nothing to bypass). Persistence is
// canonical + secret-free (no token, raw payload, signed URL; the lease token is a
// server-only nonce never surfaced in a DTO). The durable incremental cursor-sync
// queue reuses the Batch-6.8 lease/job conventions. Real adapters are wired in
// service.ts; QA drives in-memory fakes.
// ============================================================================
import type { Clock, IdGen, AuditSink } from "../connection/ports";
import type { ConversationRecord, ConversationState, InboxFilter, InboxSort, InboxPage } from "./domain";
import type { ThreadInput } from "./aggregate";
import type { InboxRow } from "./search";
import type { MetaPlatform } from "../types";

export type { Clock, IdGen, AuditSink } from "../connection/ports";

export type InboxJobStatus = "scheduled" | "available" | "claimed" | "executing" | "retry_wait" | "succeeded" | "failed" | "dead_letter" | "blocked";

export interface InboxSyncJobRow {
  id: string; orgId: string; platform: MetaPlatform; status: InboxJobStatus; priority: number; availableAtIso: string; cursor: string | null;
  attemptCount: number; maxAttempts: number; retryBudgetRemaining: number; requeueCount: number;
  leaseOwner: string | null; leaseToken: string | null; leaseExpiresAtIso: string | null; heartbeatAtIso: string | null; claimedAtIso: string | null;
  startedAtIso: string | null; completedAtIso: string | null; nextAttemptAtIso: string | null; lastErrorKind: string | null; safeLastError: string | null;
  correlationId: string; idempotencyKey: string;
}

export interface SyncStateRow { platform: MetaPlatform; cursorUpdatedAtIso: string | null; lastSyncedAtIso: string | null; syncedCount: number }
export interface ConversationFull extends ConversationRecord, ConversationState { id: string }

export interface InboxStore {
  // Incremental sync (projection over canonical comment data — no Graph call).
  listUpdatedThreads(orgId: string, platform: MetaPlatform, sinceIso: string | null, limit: number): Promise<readonly (ThreadInput & { updatedAtIso: string })[]>;
  upsertConversation(orgId: string, rec: ConversationRecord): Promise<{ id: string; created: boolean; changed: boolean }>;
  getSyncState(orgId: string, platform: MetaPlatform): Promise<SyncStateRow | null>;
  upsertSyncState(orgId: string, row: SyncStateRow): Promise<void>;
  // Conversation state (local; never touches Meta).
  getConversation(orgId: string, id: string): Promise<ConversationFull | null>;
  updateConversationState(orgId: string, id: string, state: Partial<ConversationState & { unread: boolean }>): Promise<void>;
  recordAssignment(orgId: string, conversationId: string, assigneeUserId: string | null, assignedBy: string | null): Promise<void>;
  // Labels.
  listLabels(orgId: string): Promise<readonly { id: string; name: string; color: string | null }[]>;
  createLabel(orgId: string, name: string, color: string | null): Promise<string>;
  addLabel(orgId: string, conversationId: string, labelId: string): Promise<void>;
  removeLabel(orgId: string, conversationId: string, labelId: string): Promise<void>;
  // Query.
  listConversations(orgId: string, filter: InboxFilter, sort: InboxSort, page: InboxPage): Promise<{ items: readonly InboxRow[]; total: number }>;
  countUnread(orgId: string): Promise<number>;
  // Durable jobs (reuse 6.8 conventions).
  insertJob(row: InboxSyncJobRow): Promise<void>;
  getJob(orgId: string, id: string): Promise<InboxSyncJobRow | null>;
  findJobByIdem(orgId: string, key: string): Promise<InboxSyncJobRow | null>;
  findActiveJob(orgId: string, platform: MetaPlatform): Promise<InboxSyncJobRow | null>;
  updateJob(row: InboxSyncJobRow): Promise<void>;
  claimDueJobs(args: { nowMs: number; limit: number; perOrgMax: number; leaseOwner: string; leaseSeconds: number }): Promise<readonly InboxSyncJobRow[]>;
  findStaleJobs(nowMs: number, limit: number): Promise<readonly InboxSyncJobRow[]>;
  countInFlight(): Promise<{ global: number; perOrg: Readonly<Record<string, number>> }>;
  queueHealth(orgId: string | null, nowMs: number): Promise<{ byStatus: Readonly<Record<string, number>>; deadLetter: number; oldestDueMs: number | null }>;
}

export interface CapabilityResolver { inboxReadAllowed(orgId: string, platform: MetaPlatform): Promise<boolean> }
export interface RandomSource { fraction(): number }

export interface InboxPorts {
  store: InboxStore;
  capability: CapabilityResolver;
  clock: Clock;
  ids: IdGen;
  audit: AuditSink;
  random: RandomSource;
}

export const DEFAULT_INBOX_SYNC_BATCH = 100;
export const DEFAULT_INBOX_MAX_ATTEMPTS = 6;
