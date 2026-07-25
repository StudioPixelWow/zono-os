// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INTELLIGENCE PORTS. Phase 4.
// ----------------------------------------------------------------------------
// Dependency-inversion seams for the engagement-intelligence engine. The TWO AI
// seams are ports: `ReasoningGateway` (classification — the production adapter
// delegates to the shipped AI Reasoning Gateway, never a direct provider call)
// and `CopilotGateway` (reply drafts — the production adapter delegates to the
// existing Communication Copilot, never a new reply engine). Persistence is
// canonical + secret-free: NO token, raw prompt, raw response, webhook payload,
// or Graph model. The durable scoring queue reuses the Batch-6.8 lease/job
// conventions. Real adapters wire in service.ts; QA drives in-memory fakes + a
// deterministic mock reasoning gateway + mock copilot.
// ============================================================================
import type { Clock, IdGen, AuditSink } from "../connection/ports";
import type { EngagementSignalRecord, NextBestActionRecord, IntelligenceSubjectKind, SuggestionStatus, ActionKind } from "./domain";
import type { RawClassification } from "./classify";
import type { ContextItem, SubjectSnapshot } from "./fingerprint";
import type { MetaPlatform } from "../types";

export type { Clock, IdGen, AuditSink } from "../connection/ports";

export type IntelJobKind = "score_conversation" | "rescore_conversation" | "generate_suggestions" | "expire_suggestions";
export type IntelJobStatus = "scheduled" | "available" | "claimed" | "executing" | "retry_wait" | "succeeded" | "failed" | "dead_letter" | "blocked";

export interface IntelJobRow {
  id: string; orgId: string; inboxConversationId: string; subjectKind: IntelligenceSubjectKind; subjectRef: string;
  jobKind: IntelJobKind; status: IntelJobStatus; priority: number; availableAtIso: string; contentFingerprint: string | null;
  attemptCount: number; maxAttempts: number; retryBudgetRemaining: number; requeueCount: number;
  leaseOwner: string | null; leaseToken: string | null; leaseExpiresAtIso: string | null; heartbeatAtIso: string | null; claimedAtIso: string | null;
  startedAtIso: string | null; completedAtIso: string | null; nextAttemptAtIso: string | null; lastErrorKind: string | null; safeLastError: string | null;
  correlationId: string; idempotencyKey: string;
}

export interface StoredSignal extends EngagementSignalRecord { id: string; computedAtIso: string }
export interface StoredSuggestion {
  id: string; inboxConversationId: string; engagementSignalId: string; actionKind: ActionKind;
  rationaleSafe: string; suggestedDraftRef: string | null; confidence: number; status: SuggestionStatus;
  routedRef: string | null; createdAtIso: string;
}
/** A conversation the dispatcher may need to score (its current subject state). */
export interface ScoreCandidate {
  orgId: string; inboxConversationId: string; subjectKind: IntelligenceSubjectKind; subjectRef: string; platform: MetaPlatform;
  providerObjectId: string | null; snapshot: SubjectSnapshot; currentSignalFingerprint: string | null;
}

// ── AI SEAM 1 — classification via the shipped AI Reasoning Gateway ──────────
export interface ReasoningInput {
  language: "he" | "en";
  platform: MetaPlatform;
  sourceType: IntelligenceSubjectKind;   // provider-neutral
  subjectRef: string;
  context: readonly ContextItem[];        // bounded, safe window (no raw payload)
  insightHint: string | null;             // optional narrow Phase-2 context line
}
export interface ReasoningResult {
  classification: RawClassification | null;   // validated downstream (safe fallback on null)
  provider: string | null; modelName: string | null; modelVersion: string | null; promptTemplateVersion: string | null;
  errorKind: string | null;               // transport/parse error category (safe)
}
export interface ReasoningGateway { classify(input: ReasoningInput): Promise<ReasoningResult> }

// ── AI SEAM 2 — reply drafts via the existing Communication Copilot ──────────
export interface CopilotDraftInput {
  language: "he" | "en"; platform: MetaPlatform; subjectRef: string;
  participantDisplay: string | null; context: readonly ContextItem[]; insightHint: string | null;
}
export interface CopilotDraftResult { draftRef: string; tone: string; requiresApproval: true }
/** Returns a reviewable draft reference (never the raw text here) — NEVER sends. */
export interface CopilotGateway { draftReply(input: CopilotDraftInput): Promise<CopilotDraftResult | null> }

// ── Narrow, optional Phase-2 insights context (read-only) ────────────────────
export interface InsightsContext { objectHint(orgId: string, providerObjectId: string | null): Promise<string | null> }

// ── Capability (reuse the existing evaluator — never a parallel system) ──────
export interface CapabilityResolver { intelligenceAllowed(orgId: string, platform: MetaPlatform): Promise<boolean> }
export interface RandomSource { fraction(): number }

export interface IntelligenceStore {
  // Triggers / candidates (projection over the Phase-3 inbox — read only).
  listScoreCandidates(orgId: string | null, limit: number): Promise<readonly ScoreCandidate[]>;
  getCandidate(orgId: string, inboxConversationId: string): Promise<ScoreCandidate | null>;
  loadContext(orgId: string, subjectRef: string, platform: MetaPlatform, maxItems: number): Promise<readonly ContextItem[]>;
  // Append-only signals.
  getCurrentSignal(orgId: string, subjectKind: IntelligenceSubjectKind, subjectRef: string): Promise<StoredSignal | null>;
  appendSignalAsCurrent(orgId: string, record: EngagementSignalRecord, computedAtIso: string): Promise<{ id: string }>;
  listSignalsForConversation(orgId: string, inboxConversationId: string): Promise<readonly StoredSignal[]>;
  // Suggestions (bounded, reviewable).
  replaceActiveSuggestions(orgId: string, inboxConversationId: string, signalId: string, suggestions: readonly (NextBestActionRecord & { id: string })[]): Promise<void>;
  listActiveSuggestions(orgId: string, inboxConversationId: string): Promise<readonly StoredSuggestion[]>;
  getSuggestion(orgId: string, id: string): Promise<StoredSuggestion | null>;
  markSuggestion(orgId: string, id: string, patch: { status: SuggestionStatus; actorId?: string | null; reasonSafe?: string | null; routedRef?: string | null }): Promise<void>;
  expireSuggestionsOlderThan(orgId: string | null, beforeIso: string, limit: number): Promise<number>;
  // Durable jobs (reuse 6.8 conventions).
  insertJob(row: IntelJobRow): Promise<void>;
  getJob(orgId: string, id: string): Promise<IntelJobRow | null>;
  findJobByIdem(orgId: string, key: string): Promise<IntelJobRow | null>;
  findActiveJob(orgId: string, subjectKind: IntelligenceSubjectKind, subjectRef: string): Promise<IntelJobRow | null>;
  updateJob(row: IntelJobRow): Promise<void>;
  claimDueJobs(args: { nowMs: number; limit: number; perOrgMax: number; leaseOwner: string; leaseSeconds: number }): Promise<readonly IntelJobRow[]>;
  findStaleJobs(nowMs: number, limit: number): Promise<readonly IntelJobRow[]>;
  countInFlight(): Promise<{ global: number; perOrg: Readonly<Record<string, number>> }>;
  queueHealth(orgId: string | null, nowMs: number): Promise<{ byStatus: Readonly<Record<string, number>>; deadLetter: number; oldestDueMs: number | null }>;
}

export interface IntelligencePorts {
  store: IntelligenceStore;
  reasoning: ReasoningGateway;
  copilot: CopilotGateway;
  insights: InsightsContext;
  capability: CapabilityResolver;
  clock: Clock;
  ids: IdGen;
  audit: AuditSink;
  random: RandomSource;
}

export const DEFAULT_INTEL_MAX_ATTEMPTS = 6;
export const DEFAULT_INTEL_DISPATCH_LIMIT = 8;
