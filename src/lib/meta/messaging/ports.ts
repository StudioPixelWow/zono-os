// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · MESSAGING PORTS. Phase 6.
// ----------------------------------------------------------------------------
// Dependency-inversion seams for the messaging engine. The provider seam is the
// sealed `MessagingGateway` (bounded reads + a single approval-gated send). The
// `Encryptor` seam encrypts message bodies AT REST (AES-256-GCM in production; a
// deterministic fake in QA). Persistence is canonical + secret-free (no token, raw
// payload, webhook signature, encryption key, or plaintext body column). The durable
// queue reuses the Batch-6.8 lease/job conventions. Intelligence + inbox + copilot
// are REUSED via narrow ports (Phase 4 / Phase 3 / Communication Copilot). Real
// adapters wire in service.ts; QA drives in-memory fakes + a mock gateway/encryptor.
// ============================================================================
import type { Clock, IdGen, AuditSink } from "../connection/ports";
import type { MessagingGateway } from "./provider-types";
import type { ConversationRecord, MessageRecord, ConversationFilter, ConversationSort, ConversationPage, ConversationStatus, SendApprovalState, SendStatus, WindowState, MessageDirection } from "./domain";
import type { ConvRow } from "./feed";
import type { MetaPlatform } from "../types";

export type { Clock, IdGen, AuditSink } from "../connection/ports";

export type MessagingJobKind = "dm_conversation_sync" | "dm_message_sync" | "dm_backfill" | "dm_send_execute";
export type MessagingJobStatus = "scheduled" | "available" | "claimed" | "executing" | "retry_wait" | "succeeded" | "failed" | "dead_letter" | "blocked";

export interface MessagingJobRow {
  id: string; orgId: string; conversationId: string | null; sendId: string | null; jobKind: MessagingJobKind; status: MessagingJobStatus; priority: number; availableAtIso: string;
  cursorRef: string | null; pageBudget: number; recordBudget: number;
  attemptCount: number; maxAttempts: number; retryBudgetRemaining: number; requeueCount: number; retryAfterMs: number | null;
  leaseOwner: string | null; leaseToken: string | null; leaseExpiresAtIso: string | null; heartbeatAtIso: string | null; claimedAtIso: string | null;
  startedAtIso: string | null; completedAtIso: string | null; nextAttemptAtIso: string | null; lastErrorKind: string | null; safeLastError: string | null;
  correlationId: string; idempotencyKey: string;
}
export interface ConversationRow { id: string; orgId: string; platform: MetaPlatform; assetId: string; externalThreadId: string; participantExternalId: string | null; participantDisplaySafe: string | null; lastInboundAt: string | null; lastMessageAt: string | null; unread: boolean; status: ConversationStatus; assigneeUserId: string | null; inboxConversationId: string | null; cursorRef: string | null }
export interface StoredMessageMeta { id: string; conversationId: string; externalMessageId: string; direction: MessageDirection; senderExternalId: string | null; policyTag: string | null; deliveryState: string | null; providerCreatedAt: string | null }
export interface DecryptedMessage extends StoredMessageMeta { body: string }
export interface SendRow { id: string; orgId: string; conversationId: string; policyTag: string | null; windowState: WindowState; approvalState: SendApprovalState; status: SendStatus; requestedBy: string | null; approvedBy: string | null; providerMessageId: string | null; safeErrorKind: string | null; attemptCount: number; correlationId: string; idempotencyKey: string }

/** AES-256-GCM at-rest encryption for message bodies (production) / fake (QA). */
export interface Encryptor { encrypt(plaintext: string): string; decrypt(ciphertext: string): string }
export interface Credential { resolve(orgId: string, assetId: string): Promise<{ externalId: string; tokenPlain: string } | null> }
export interface CapabilityResolver {
  messagingReadAllowed(orgId: string, assetId: string, platform: MetaPlatform): Promise<boolean>;
  messagingReplyAllowed(orgId: string, assetId: string, platform: MetaPlatform): Promise<{ allowed: boolean; assetActive: boolean }>;
}
export interface IntelligenceEnqueue { enqueueForConversation(orgId: string, inboxConversationId: string): Promise<string | null> }
export interface InboxProjection { projectThread(orgId: string, input: { platform: MetaPlatform; subjectRef: string; participantDisplay: string | null; placeholder: string; lastActivityAt: string | null }): Promise<{ conversationId: string; created: boolean }> }
export interface CopilotDraft { draftReply(input: { platform: MetaPlatform; participantDisplay: string | null; recentText: readonly string[] }): Promise<{ body: string; requiresApproval: true } | null> }
export interface RandomSource { fraction(): number }

export interface MessagingStore {
  // Conversations.
  getConversation(orgId: string, id: string): Promise<ConversationRow | null>;
  getConversationByThread(orgId: string, platform: MetaPlatform, externalThreadId: string): Promise<ConversationRow | null>;
  upsertConversation(orgId: string, assetId: string, rec: ConversationRecord): Promise<{ id: string; created: boolean }>;
  updateConversation(orgId: string, id: string, patch: Partial<ConversationRow> & { lastPreviewCipher?: string | null }): Promise<void>;
  listConversations(orgId: string, filter: ConversationFilter, sort: ConversationSort, page: ConversationPage): Promise<{ items: readonly ConvRow[]; total: number }>;
  listSyncConversations(orgId: string | null, limit: number): Promise<readonly ConversationRow[]>;
  // Messages (bodies ENCRYPTED at rest).
  findMessage(orgId: string, conversationId: string, externalMessageId: string): Promise<{ id: string } | null>;
  insertMessage(orgId: string, conversationId: string, rec: MessageRecord, bodyCipher: string, fingerprint: string, sendId?: string | null): Promise<{ id: string; created: boolean }>;
  listMessages(orgId: string, conversationId: string, limit: number): Promise<readonly { id: string; direction: MessageDirection; senderExternalId: string | null; bodyCipher: string | null; policyTag: string | null; deliveryState: string | null; providerCreatedAt: string | null }[]>;
  setMessageDelivery(orgId: string, sendId: string, providerMessageId: string | null, deliveryState: string): Promise<void>;
  // Sends (approval-gated).
  insertSend(row: SendRow & { draftBodyCipher: string }): Promise<void>;
  getSend(orgId: string, id: string): Promise<(SendRow & { draftBodyCipher: string }) | null>;
  updateSend(orgId: string, id: string, patch: Partial<SendRow>): Promise<void>;
  // Trusted asset resolution (asset→org trusted; never from a payload).
  resolveConnectedAsset(orgId: string, assetId: string): Promise<{ assetExternalId: string; platform: MetaPlatform } | null>;
  // Durable jobs.
  insertJob(row: MessagingJobRow): Promise<void>;
  getJob(orgId: string, id: string): Promise<MessagingJobRow | null>;
  findJobByIdem(orgId: string, key: string): Promise<MessagingJobRow | null>;
  findActiveJob(orgId: string, conversationId: string, jobKind: MessagingJobKind): Promise<MessagingJobRow | null>;
  updateJob(row: MessagingJobRow): Promise<void>;
  claimDueJobs(args: { nowMs: number; limit: number; perOrgMax: number; leaseOwner: string; leaseSeconds: number }): Promise<readonly MessagingJobRow[]>;
  findStaleJobs(nowMs: number, limit: number): Promise<readonly MessagingJobRow[]>;
  countInFlight(): Promise<{ global: number; perOrg: Readonly<Record<string, number>> }>;
  queueHealth(orgId: string | null, nowMs: number): Promise<{ byStatus: Readonly<Record<string, number>>; deadLetter: number; oldestDueMs: number | null }>;
}

export interface MessagingPorts {
  store: MessagingStore;
  gateway: MessagingGateway;
  encryptor: Encryptor;
  credential: Credential;
  capability: CapabilityResolver;
  intelligence: IntelligenceEnqueue;
  inbox: InboxProjection;
  copilot: CopilotDraft;
  clock: Clock;
  ids: IdGen;
  audit: AuditSink;
  random: RandomSource;
}

export const DEFAULT_MESSAGING_MAX_ATTEMPTS = 6;
