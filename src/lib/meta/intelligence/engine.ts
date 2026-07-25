// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · ENGAGEMENT INTELLIGENCE ENGINE (PURE). Phase 4.
// ----------------------------------------------------------------------------
// The durable scoring brain over injected ports. It REUSES the Batch-6.8 lease/
// fencing model + bounded backoff — one durable-job model, not a new one. Flow:
// detect material change (fingerprint) → enqueue → claim → fence → load BOUNDED
// safe context → Reasoning Gateway classify → STRICT validate (safe fallback) →
// append-only signal (never mutate history; supersede the prior current) → derive
// BOUNDED suggestions → optionally a reviewable Copilot draft → emit DEDUPED
// notifications → finalize. Invalid AI output NEVER becomes a confident current
// signal and NEVER leaves partial state. Nothing here calls Meta or executes an
// action — AI output is a suggestion. Accept/dismiss route into EXISTING workflows.
// ============================================================================
import type { IntelligencePorts, IntelJobRow, IntelJobStatus, IntelJobKind, ScoreCandidate, StoredSuggestion } from "./ports";
import { DEFAULT_INTEL_MAX_ATTEMPTS } from "./ports";
import { heartbeatLease, canFinalize, isLeaseStale, DEFAULT_LEASE_MS, type LeaseState } from "../schedule/lease";
import { computeBackoffMs, DEFAULT_RETRY_POLICY } from "../schedule/retry";
import { subjectFingerprint, isMaterialChange, boundedContext, CONTEXT_MAX_ITEMS } from "./fingerprint";
import { validateClassification } from "./classify";
import { deriveSuggestions } from "./suggest";
import { canAccept, canDismiss, ROUTE_BY_ACTION, type RouteTarget } from "./state";
import { MAX_ACTIVE_SUGGESTIONS, MIN_NOTIFY_CONFIDENCE, SUGGESTION_TTL_MS, type EngagementSignalRecord, type NextBestActionRecord } from "./domain";
import { buildMetaNotificationEvent } from "../notify/events";
import type { MetaNotificationEvent } from "../notify/types";

const TERMINAL = new Set<IntelJobStatus>(["succeeded", "failed", "dead_letter"]);
const leaseState = (j: IntelJobRow): LeaseState => ({ status: j.status, leaseOwner: j.leaseOwner, leaseToken: j.leaseToken, leaseExpiresAtMs: j.leaseExpiresAtIso ? Date.parse(j.leaseExpiresAtIso) : null });

// ── Triggers: enqueue scoring for materially-changed subjects (no loop) ───────
export async function enqueueDueScoring(ports: IntelligencePorts, opts: { orgId?: string | null; limit?: number; correlationId: string }): Promise<{ scanned: number; enqueued: number }> {
  const candidates = await ports.store.listScoreCandidates(opts.orgId ?? null, opts.limit ?? 50);
  let enqueued = 0;
  for (const c of candidates) {
    const fp = subjectFingerprint(c.snapshot);
    if (!isMaterialChange(c.currentSignalFingerprint, fp)) continue;   // cosmetic/no change → skip (no rescore)
    const idem = `${c.inboxConversationId}|intel_score|${fp}`;         // same fingerprint → same job (no duplicate, no loop)
    const r = await scheduleScoring(ports, { orgId: c.orgId, candidate: c, fingerprint: fp, jobKind: "score_conversation", priority: 90, correlationId: opts.correlationId, idempotencyKey: idem });
    if (!r.resumed) enqueued++;
  }
  return { scanned: candidates.length, enqueued };
}

export async function scheduleScoring(ports: IntelligencePorts, input: { orgId: string; candidate: ScoreCandidate; fingerprint: string; jobKind: IntelJobKind; priority?: number; availableAtMs?: number; correlationId: string; idempotencyKey: string }): Promise<{ job: IntelJobRow; resumed: boolean }> {
  const existing = await ports.store.findJobByIdem(input.orgId, input.idempotencyKey);
  if (existing) return { job: existing, resumed: true };
  const active = await ports.store.findActiveJob(input.orgId, input.candidate.subjectKind, input.candidate.subjectRef);
  if (active) return { job: active, resumed: true };
  const job = newJob(ports, input);
  await ports.store.insertJob(job);
  await ports.audit.log({ action: "meta.intelligence.job_scheduled", entityId: job.id, summary: "intelligence scoring scheduled", metadata: { jobKind: input.jobKind } });
  return { job, resumed: false };
}
function newJob(ports: IntelligencePorts, input: { orgId: string; candidate: ScoreCandidate; fingerprint: string; jobKind: IntelJobKind; priority?: number; availableAtMs?: number; correlationId: string; idempotencyKey: string }): IntelJobRow {
  const c = input.candidate;
  return { id: ports.ids.uuid(), orgId: input.orgId, inboxConversationId: c.inboxConversationId, subjectKind: c.subjectKind, subjectRef: c.subjectRef, jobKind: input.jobKind, status: "scheduled", priority: input.priority ?? 100, availableAtIso: new Date(input.availableAtMs ?? ports.clock.nowMs()).toISOString(), contentFingerprint: input.fingerprint, attemptCount: 0, maxAttempts: DEFAULT_INTEL_MAX_ATTEMPTS, retryBudgetRemaining: DEFAULT_INTEL_MAX_ATTEMPTS, requeueCount: 0, leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null, heartbeatAtIso: null, claimedAtIso: null, startedAtIso: null, completedAtIso: null, nextAttemptAtIso: null, lastErrorKind: null, safeLastError: null, correlationId: input.correlationId, idempotencyKey: input.idempotencyKey };
}

/** Manual rescore — allowed even without a material change (explicit override). */
export async function scheduleManualRescore(ports: IntelligencePorts, orgId: string, candidate: ScoreCandidate, correlationId: string): Promise<{ job: IntelJobRow; resumed: boolean }> {
  const fp = subjectFingerprint(candidate.snapshot);
  const idem = `${candidate.inboxConversationId}|intel_rescore|${fp}`;
  return scheduleScoring(ports, { orgId, candidate, fingerprint: fp, jobKind: "rescore_conversation", priority: 60, correlationId, idempotencyKey: idem });
}

// ── Dispatch / heartbeat ──────────────────────────────────────────────────────
export async function dispatchDue(ports: IntelligencePorts, opts: { leaseOwner: string; limit?: number; perOrgMax?: number; leaseSeconds?: number }): Promise<readonly IntelJobRow[]> {
  const inFlight = await ports.store.countInFlight();
  const limit = Math.max(0, Math.min(opts.limit ?? 8, Math.max(0, 16 - inFlight.global)));
  if (limit === 0) return [];
  const claimed = await ports.store.claimDueJobs({ nowMs: ports.clock.nowMs(), limit, perOrgMax: opts.perOrgMax ?? 3, leaseOwner: opts.leaseOwner, leaseSeconds: Math.round((opts.leaseSeconds ?? DEFAULT_LEASE_MS / 1000)) });
  for (const j of claimed) await ports.audit.log({ action: "meta.intelligence.job_claimed", entityId: j.id, summary: "intelligence scoring claimed", metadata: { jobKind: j.jobKind } });
  return claimed;
}
export async function heartbeat(ports: IntelligencePorts, orgId: string, jobId: string, owner: string, token: string): Promise<{ ok: boolean; reason: string | null }> {
  const job = await ports.store.getJob(orgId, jobId);
  if (!job) return { ok: false, reason: "not_found" };
  const hb = heartbeatLease(leaseState(job), owner, token, ports.clock.nowMs());
  if (!hb.ok) return { ok: false, reason: hb.reason };
  await ports.store.updateJob({ ...job, leaseExpiresAtIso: new Date(hb.leaseExpiresAtMs!).toISOString(), heartbeatAtIso: new Date(hb.heartbeatAtMs!).toISOString() });
  return { ok: true, reason: null };
}

// ── Work one claimed scoring job ─────────────────────────────────────────────────
export interface WorkResult { job: IntelJobRow; outcome: string; events: readonly MetaNotificationEvent[]; signalId?: string; suggestions?: number }
export async function workJob(ports: IntelligencePorts, job0: IntelJobRow): Promise<WorkResult> {
  const current = await ports.store.getJob(job0.orgId, job0.id);
  if (!current) return { job: job0, outcome: "fence_not_found", events: [] };
  if (TERMINAL.has(current.status)) return { job: current, outcome: "already_terminal", events: [] };
  const fence = canFinalize(leaseState(current), job0.leaseOwner ?? "", job0.leaseToken ?? "");
  if (!fence.ok) return { job: current, outcome: `fence_${fence.reason}`, events: [] };
  const job: IntelJobRow = { ...current, status: "executing", startedAtIso: ports.clock.nowIso(), heartbeatAtIso: ports.clock.nowIso() };
  await ports.store.updateJob(job);

  const candidate = await ports.store.getCandidate(job.orgId, job.inboxConversationId);
  if (!candidate) return finalize(ports, job, "failed", "candidate_missing", []);
  if (!(await ports.capability.intelligenceAllowed(job.orgId, candidate.platform))) return finalize(ports, job, "blocked", "capability_denied", []);

  // Recovery idempotency: if a scored current signal already matches this
  // fingerprint, the job's work is already done — don't append a duplicate.
  const existingCurrent = await ports.store.getCurrentSignal(job.orgId, candidate.subjectKind, candidate.subjectRef);
  const fp = job.contentFingerprint ?? subjectFingerprint(candidate.snapshot);
  if (existingCurrent && existingCurrent.processingState === "scored" && existingCurrent.contentFingerprint === fp) {
    return finalize(ports, job, "succeeded", null, []);
  }

  // Load the BOUNDED, safe context window + optional narrow insight hint.
  let context, insightHint: string | null;
  try {
    context = boundedContext(await ports.store.loadContext(job.orgId, candidate.subjectRef, candidate.platform, CONTEXT_MAX_ITEMS));
    insightHint = await ports.insights.objectHint(job.orgId, candidate.providerObjectId);
  } catch { return retryOrFail(ports, job, "internal", "context_failed"); }

  // AI SEAM 1 — classify via the shipped Reasoning boundary (never a direct call).
  const reasoning = await ports.reasoning.classify({ language: "he", platform: candidate.platform, sourceType: candidate.subjectKind, subjectRef: candidate.subjectRef, context, insightHint });
  if (reasoning.errorKind) return retryOrFail(ports, job, "ai_transport", reasoning.errorKind);

  const validated = validateClassification(reasoning.classification);
  if (!validated.ok) {
    // Invalid / off-taxonomy output — fail safe. NO partial current signal is written.
    const done = await finalize(ports, job, "failed", "invalid_ai_output", []);
    return { ...done, events: [scoringFailedEvent(ports, job, fp)] };
  }

  // Append-only signal (supersedes the prior current; history is never mutated).
  const record: EngagementSignalRecord = {
    subjectKind: candidate.subjectKind, subjectRef: candidate.subjectRef, inboxConversationId: candidate.inboxConversationId,
    sentiment: validated.sentiment, sentimentScore: validated.sentimentScore, intent: validated.intent, urgency: validated.urgency, confidence: validated.confidence,
    modelProviderSafe: reasoning.provider, modelNameSafe: reasoning.modelName, modelVersionSafe: reasoning.modelVersion, promptTemplateVersion: reasoning.promptTemplateVersion,
    contentFingerprint: fp, processingState: "scored", safeErrorKind: null,
  };
  const { id: signalId } = await ports.store.appendSignalAsCurrent(job.orgId, record, ports.clock.nowIso());

  // Derive BOUNDED suggestions; a reply suggestion gets a reviewable Copilot draft.
  const derived = deriveSuggestions({ sentiment: validated.sentiment, intent: validated.intent, urgency: validated.urgency, confidence: validated.confidence }).slice(0, MAX_ACTIVE_SUGGESTIONS);
  const suggestions: (NextBestActionRecord & { id: string })[] = [];
  for (const d of derived) {
    let draftRef: string | null = null;
    if (d.needsDraft) {
      // AI SEAM 2 — reply draft via the existing Communication Copilot (never sends).
      const draft = await ports.copilot.draftReply({ language: "he", platform: candidate.platform, subjectRef: candidate.subjectRef, participantDisplay: null, context, insightHint }).catch(() => null);
      draftRef = draft?.draftRef ?? null;
    }
    suggestions.push({ id: ports.ids.uuid(), actionKind: d.actionKind, rationaleSafe: d.rationaleSafe, suggestedDraftRef: draftRef, confidence: d.confidence });
  }
  await ports.store.replaceActiveSuggestions(job.orgId, candidate.inboxConversationId, signalId, suggestions);

  // DEDUPED notifications — one per signal fingerprint (the job is idempotent per fp).
  const events: MetaNotificationEvent[] = [];
  if ((validated.urgency === "high" || validated.urgency === "critical") && validated.confidence >= MIN_NOTIFY_CONFIDENCE) {
    events.push(buildMetaNotificationEvent({ event: "meta.intelligence.high_urgency_detected", orgId: job.orgId, occurredAt: ports.clock.nowIso(), assetRef: candidate.providerObjectId, correlationId: job.correlationId, data: { platform: candidate.platform, urgency: validated.urgency, intent: validated.intent } }));
  }
  if (suggestions.length > 0) {
    events.push(buildMetaNotificationEvent({ event: "meta.intelligence.suggestion_ready", orgId: job.orgId, occurredAt: ports.clock.nowIso(), assetRef: candidate.providerObjectId, correlationId: job.correlationId, data: { platform: candidate.platform, count: suggestions.length } }));
  }
  await ports.audit.log({ action: "meta.intelligence.signal_computed", entityId: signalId, summary: "engagement signal computed", metadata: { intent: validated.intent, urgency: validated.urgency, sentiment: validated.sentiment, suggestions: suggestions.length } });

  const done = await finalize(ports, job, "succeeded", null, events);
  return { ...done, signalId, suggestions: suggestions.length };
}

function scoringFailedEvent(ports: IntelligencePorts, job: IntelJobRow, fp: string): MetaNotificationEvent {
  return buildMetaNotificationEvent({ event: "meta.intelligence.scoring_failed", orgId: job.orgId, occurredAt: ports.clock.nowIso(), assetRef: null, correlationId: job.correlationId, data: { fingerprint: fp.slice(0, 8) } });
}
async function retryOrFail(ports: IntelligencePorts, job: IntelJobRow, errorKind: string, reason: string): Promise<WorkResult> {
  if (job.retryBudgetRemaining > 0 && job.attemptCount + 1 < job.maxAttempts) {
    const delay = computeBackoffMs(job.attemptCount + 1, DEFAULT_RETRY_POLICY, ports.random.fraction(), null);
    const next: IntelJobRow = { ...job, status: "retry_wait", attemptCount: job.attemptCount + 1, retryBudgetRemaining: job.retryBudgetRemaining - 1, availableAtIso: new Date(ports.clock.nowMs() + delay).toISOString(), lastErrorKind: errorKind, leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null };
    await ports.store.updateJob(next);
    return { job: next, outcome: "retry_scheduled", events: [] };
  }
  const done = await finalize(ports, job, "failed", reason, []);
  return { ...done, events: [scoringFailedEvent(ports, job, job.contentFingerprint ?? "")] };
}
async function finalize(ports: IntelligencePorts, job: IntelJobRow, status: IntelJobStatus, error: string | null, events: readonly MetaNotificationEvent[]): Promise<WorkResult> {
  const done: IntelJobRow = { ...job, status, completedAtIso: ports.clock.nowIso(), lastErrorKind: error, leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null };
  await ports.store.updateJob(done);
  await ports.audit.log({ action: "meta.intelligence.job_completed", entityId: job.id, summary: `intelligence scoring ${status}`, metadata: { status, error } });
  return { job: done, outcome: status, events };
}

// ── Recovery (read/AI jobs are safely re-runnable; no provider side effect) ───
export async function recoverAbandoned(ports: IntelligencePorts, opts?: { limit?: number }): Promise<{ recovered: number; requeued: number; deadLettered: number }> {
  const nowMs = ports.clock.nowMs();
  const stale = await ports.store.findStaleJobs(nowMs, opts?.limit ?? 16);
  let requeued = 0, deadLettered = 0;
  for (const job of stale) {
    if (!isLeaseStale(leaseState(job), nowMs)) continue;
    if (job.attemptCount >= job.maxAttempts) { await ports.store.updateJob({ ...job, status: "dead_letter", completedAtIso: ports.clock.nowIso(), leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null }); deadLettered++; }
    else { await ports.store.updateJob({ ...job, status: "available", requeueCount: job.requeueCount + 1, availableAtIso: new Date(nowMs).toISOString(), leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null }); requeued++; }
    await ports.audit.log({ action: "meta.intelligence.job_recovered", entityId: job.id, summary: "abandoned scoring recovered", metadata: { requeued: job.attemptCount < job.maxAttempts } });
  }
  return { recovered: stale.length, requeued, deadLettered };
}

// ── Suggestion expiry (bounded; no forever-open cards) ────────────────────────
export async function expireDueSuggestions(ports: IntelligencePorts, opts?: { orgId?: string | null; limit?: number }): Promise<{ expired: number }> {
  const before = new Date(ports.clock.nowMs() - SUGGESTION_TTL_MS).toISOString();
  const expired = await ports.store.expireSuggestionsOlderThan(opts?.orgId ?? null, before, opts?.limit ?? 200);
  return { expired };
}

// ── Accept / dismiss (route into EXISTING workflows; never execute Meta) ──────
export interface AcceptPlan { ok: boolean; error: string | null; routeTarget: RouteTarget | null; suggestion: StoredSuggestion | null }
/** Validate + mark accepted, returning the route into an existing workflow. The
 *  SERVICE performs the routing (draft/moderation/assignment) — the engine never
 *  executes a provider action. */
export async function acceptSuggestion(ports: IntelligencePorts, orgId: string, actorId: string, suggestionId: string, routedRef: string | null): Promise<AcceptPlan> {
  const s = await ports.store.getSuggestion(orgId, suggestionId);
  if (!s) return { ok: false, error: "not_found", routeTarget: null, suggestion: null };
  const guard = canAccept(s.status);
  if (!guard.ok) return { ok: false, error: guard.reason, routeTarget: null, suggestion: s };
  const routeTarget = ROUTE_BY_ACTION[s.actionKind];
  await ports.store.markSuggestion(orgId, suggestionId, { status: "accepted", actorId, routedRef });
  await ports.audit.log({ action: "meta.intelligence.suggestion_accepted", entityId: suggestionId, summary: "suggestion accepted (routed to existing workflow)", metadata: { actionKind: s.actionKind, routeTarget, by: actorId } });
  return { ok: true, error: null, routeTarget, suggestion: s };
}
export async function dismissSuggestion(ports: IntelligencePorts, orgId: string, actorId: string, suggestionId: string, reasonSafe: string | null): Promise<{ ok: boolean; error: string | null }> {
  const s = await ports.store.getSuggestion(orgId, suggestionId);
  if (!s) return { ok: false, error: "not_found" };
  const guard = canDismiss(s.status);
  if (!guard.ok) return { ok: false, error: guard.reason };
  await ports.store.markSuggestion(orgId, suggestionId, { status: "dismissed", actorId, reasonSafe: (reasonSafe ?? "").slice(0, 200) || null });
  await ports.audit.log({ action: "meta.intelligence.suggestion_dismissed", entityId: suggestionId, summary: "suggestion dismissed", metadata: { by: actorId } });
  return { ok: true, error: null };
}
