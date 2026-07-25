// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · LISTENING PORTS. Phase 5.
// ----------------------------------------------------------------------------
// Dependency-inversion seams for the listening engine. The provider seam is the
// sealed READ-ONLY `ListeningGateway` (no write surface). Persistence is canonical
// + secret-free (no token, raw payload, webhook signature, raw cursor text — the
// cursor is an opaque provider-isolated ref). The durable queue reuses the Batch-6.8
// lease/job conventions. Intelligence + inbox are REUSED via narrow ports (Phase 4
// scoring path + Phase 3 inbox projection) — never duplicated. Real adapters wire in
// service.ts; QA drives in-memory fakes + a mock sealed gateway.
// ============================================================================
import type { Clock, IdGen, AuditSink } from "../connection/ports";
import type { ListeningGateway } from "./provider-types";
import type { MentionRecord, MentionFilter, MentionSort, MentionPage, MentionStatus, MatchState, ListeningSourceKind, SourceCapabilityState } from "./domain";
import type { MatchCandidates } from "./match";
import type { FeedRow } from "./feed";
import type { MetaPlatform } from "../types";

export type { Clock, IdGen, AuditSink } from "../connection/ports";

export type ListeningJobKind = "listening_backfill" | "listening_poll" | "listening_webhook_followup" | "listening_gap_fill" | "listening_reconcile";
export type ListeningJobStatus = "scheduled" | "available" | "claimed" | "executing" | "retry_wait" | "succeeded" | "failed" | "dead_letter" | "blocked";

export interface ListeningJobRow {
  id: string; orgId: string; listeningSourceId: string; jobKind: ListeningJobKind; status: ListeningJobStatus; priority: number; availableAtIso: string;
  cursorRef: string | null; pageBudget: number; recordBudget: number;
  attemptCount: number; maxAttempts: number; retryBudgetRemaining: number; requeueCount: number; retryAfterMs: number | null;
  leaseOwner: string | null; leaseToken: string | null; leaseExpiresAtIso: string | null; heartbeatAtIso: string | null; claimedAtIso: string | null;
  startedAtIso: string | null; completedAtIso: string | null; nextAttemptAtIso: string | null; lastErrorKind: string | null; safeLastError: string | null;
  correlationId: string; idempotencyKey: string;
}

export interface ListeningSourceRow {
  id: string; orgId: string; platform: MetaPlatform; sourceKind: ListeningSourceKind; assetId: string; assetExternalId: string | null;
  enabled: boolean; capabilityState: SourceCapabilityState; safeBlockReason: string | null; cursorRef: string | null;
  backfillState: string; lastPolledAtIso: string | null; nextPollAtIso: string | null; lastSyncStatus: string;
}
export interface StoredMention extends MentionRecord { id: string; status: MentionStatus; matchState: MatchState; matchedAssetId: string | null; matchedProviderObjectId: string | null; inboxConversationId: string | null; intelligenceSignalRef: string | null; ingestedAtIso: string }

export interface Credential { resolve(orgId: string, assetId: string): Promise<{ externalId: string; tokenPlain: string } | null> }
export interface CapabilityResolver {
  /** listening.read for (platform, surface): capability + token health + support. */
  listeningAllowed(orgId: string, assetId: string, platform: MetaPlatform, sourceKind: ListeningSourceKind): Promise<{ allowed: boolean; state: SourceCapabilityState; reason: string | null }>;
  killSwitchEngaged(orgId: string): Promise<boolean>;
}
/** Phase-4 reuse — enqueue scoring on the EXISTING intelligence job path (no new model). */
export interface IntelligenceEnqueue { enqueueForConversation(orgId: string, conversationId: string): Promise<string | null> }
/** Phase-3 reuse — project an actionable mention into the existing inbox (dedup by subject). */
export interface InboxProjection { projectMention(orgId: string, input: { platform: MetaPlatform; subjectRef: string; providerObjectId: string | null; participantDisplay: string | null; preview: string; lastActivityAt: string | null }): Promise<{ conversationId: string; created: boolean }> }
export interface RandomSource { fraction(): number }

export interface ListeningStore {
  // Sources.
  getSource(orgId: string, id: string): Promise<ListeningSourceRow | null>;
  listSources(orgId: string): Promise<readonly ListeningSourceRow[]>;
  findSourceByAsset(orgId: string, assetId: string, sourceKind: ListeningSourceKind): Promise<ListeningSourceRow | null>;
  createSource(row: ListeningSourceRow & { createdBy: string | null }): Promise<void>;
  updateSource(orgId: string, id: string, patch: Partial<ListeningSourceRow>): Promise<void>;
  listDueSources(nowMs: number, limit: number): Promise<readonly ListeningSourceRow[]>;
  // Trusted asset resolution (asset→org is trusted; NEVER from a payload).
  resolveConnectedAsset(orgId: string, assetId: string): Promise<{ assetExternalId: string; platform: MetaPlatform } | null>;
  // Mentions (canonical, append-safe with edit handling).
  findMention(orgId: string, platform: MetaPlatform, externalMentionId: string): Promise<StoredMention | null>;
  upsertMention(orgId: string, sourceId: string, rec: MentionRecord, fingerprint: string): Promise<{ id: string; created: boolean; changed: boolean }>;
  setMentionMatch(orgId: string, id: string, m: { matchState: MatchState; matchedAssetId: string | null; matchedProviderObjectId: string | null }): Promise<void>;
  setMentionProjection(orgId: string, id: string, conversationId: string): Promise<void>;
  getMention(orgId: string, id: string): Promise<StoredMention | null>;
  setMentionStatus(orgId: string, id: string, status: MentionStatus, actorId: string | null): Promise<void>;
  listFeed(orgId: string, filter: MentionFilter, sort: MentionSort, page: MentionPage): Promise<{ items: readonly FeedRow[]; total: number }>;
  // Matching lookups (trusted; org is fixed, never inferred from content).
  matchCandidates(orgId: string, trustedAssetId: string, sourceObjectRef: string | null): Promise<MatchCandidates>;
  // Durable jobs (reuse 6.8 conventions).
  insertJob(row: ListeningJobRow): Promise<void>;
  getJob(orgId: string, id: string): Promise<ListeningJobRow | null>;
  findJobByIdem(orgId: string, key: string): Promise<ListeningJobRow | null>;
  findActiveJob(orgId: string, sourceId: string, jobKind: ListeningJobKind): Promise<ListeningJobRow | null>;
  updateJob(row: ListeningJobRow): Promise<void>;
  claimDueJobs(args: { nowMs: number; limit: number; perOrgMax: number; leaseOwner: string; leaseSeconds: number }): Promise<readonly ListeningJobRow[]>;
  findStaleJobs(nowMs: number, limit: number): Promise<readonly ListeningJobRow[]>;
  countInFlight(): Promise<{ global: number; perOrg: Readonly<Record<string, number>> }>;
  queueHealth(orgId: string | null, nowMs: number): Promise<{ byStatus: Readonly<Record<string, number>>; deadLetter: number; oldestDueMs: number | null }>;
}

export interface ListeningPorts {
  store: ListeningStore;
  gateway: ListeningGateway;
  credential: Credential;
  capability: CapabilityResolver;
  intelligence: IntelligenceEnqueue;
  inbox: InboxProjection;
  clock: Clock;
  ids: IdGen;
  audit: AuditSink;
  random: RandomSource;
}

export const DEFAULT_LISTENING_MAX_ATTEMPTS = 6;
