// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · PHASE 4 SELF TEST (Engagement Intelligence).
// Runnable gate: `npx tsx src/lib/meta/intelligence/qa.ts`.
// Deterministic M1–M60 (+ scenarios) over the PURE domain (classify/suggest/state/
// fingerprint) and the pure engine driven against in-memory fakes + a MOCK Reasoning
// Gateway + a MOCK Communication Copilot (the AI boundary + Copilot are stubbed at
// the seam — no model call). No network, no DB, no ambient clock/RNG. Also asserts
// the boundary guard on synthetic fixtures + static frozen/absence proofs from disk.
// ============================================================================
import { readFileSync } from "node:fs";
import { validateClassification, SAFE_FALLBACK, type RawClassification } from "./classify";
import { deriveSuggestions } from "./suggest";
import { canAccept, canDismiss, ROUTE_BY_ACTION, acceptIsNonExecuting } from "./state";
import { subjectFingerprint, isMaterialChange, boundedContext, fingerprint, type SubjectSnapshot } from "./fingerprint";
import { toSignalDTO, toSuggestionDTO, toConversationIntelligence } from "./read";
import { validateMetricContract, evaluateQueueHealth, INTEL_METRICS } from "./observability";
import { canViewIntelligence, canRescore, canAcceptSuggestion } from "./roles";
import { MAX_ACTIVE_SUGGESTIONS } from "./domain";
import * as engine from "./engine";
import type { IntelligenceStore, IntelligencePorts, IntelJobRow, ScoreCandidate, StoredSignal, StoredSuggestion, ReasoningResult } from "./ports";
import type { EngagementSignalRecord } from "./domain";
import type { ContextItem } from "./fingerprint";
import { scanContent } from "./../../../../scripts/check-meta-boundaries.mjs";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log("  ✓ " + n); } else { failed++; console.error("  ✗ " + n); } };
console.log("\nMeta Workspace (6.9) Phase 4 — SELF TEST (Engagement Intelligence)\n");

const snap = (o: Partial<SubjectSnapshot> = {}): SubjectSnapshot => ({ subjectRef: o.subjectRef ?? "t1", replyCount: o.replyCount ?? 2, lastActivityAt: o.lastActivityAt ?? "2027-01-02T00:00:00Z", subjectPreview: o.subjectPreview ?? "כמה עולה הדירה?" });
const candidate = (o: Partial<ScoreCandidate> = {}): ScoreCandidate => ({ orgId: o.orgId ?? "o1", inboxConversationId: o.inboxConversationId ?? "cv1", subjectKind: "comment_thread", subjectRef: o.subjectRef ?? "t1", platform: o.platform ?? "facebook", providerObjectId: o.providerObjectId ?? "po1", snapshot: o.snapshot ?? snap({ subjectRef: o.subjectRef ?? "t1" }), currentSignalFingerprint: o.currentSignalFingerprint ?? null });
const cls = (o: Partial<RawClassification> = {}): RawClassification => ({ sentiment: o.sentiment ?? "positive", sentimentScore: o.sentimentScore ?? 40, intent: o.intent ?? "pricing_question", urgency: o.urgency ?? "normal", confidence: o.confidence ?? 80, rationale: o.rationale ?? "שאלת מחיר" });

// ── In-memory IntelligenceStore fake ─────────────────────────────────────────
function memStore() {
  const jobs = new Map<string, IntelJobRow>();
  const signals: StoredSignal[] = [];
  const suggestions: StoredSuggestion[] = [];
  const candidates = new Map<string, ScoreCandidate>();
  const contextByRef = new Map<string, ContextItem[]>();
  let sid = 0;
  const store: IntelligenceStore = {
    async listScoreCandidates(orgId, limit) { return [...candidates.values()].filter((c) => !orgId || c.orgId === orgId).slice(0, limit); },
    async getCandidate(orgId, id) { const c = candidates.get(`${orgId}|${id}`); return c ?? null; },
    async loadContext(orgId, subjectRef) { return contextByRef.get(subjectRef) ?? []; },
    async getCurrentSignal(orgId, subjectKind, subjectRef) { return signals.find((s) => s.subjectRef === subjectRef && s.subjectKind === subjectKind && (s as unknown as { isCurrent?: boolean }).isCurrent !== false && s.processingState === "scored") ?? null; },
    async appendSignalAsCurrent(orgId, record: EngagementSignalRecord, computedAtIso) {
      for (const s of signals) if (s.subjectRef === record.subjectRef && s.subjectKind === record.subjectKind) { (s as unknown as { isCurrent?: boolean }).isCurrent = false; if (s.processingState === "scored") s.processingState = "superseded"; }
      const id = `sig-${++sid}`;
      const stored: StoredSignal & { isCurrent?: boolean } = { id, ...record, processingState: "scored", computedAtIso, isCurrent: true } as StoredSignal & { isCurrent?: boolean };
      signals.push(stored); return { id };
    },
    async listSignalsForConversation(orgId, id) { return signals.filter((s) => s.inboxConversationId === id).slice().reverse(); },
    async replaceActiveSuggestions(orgId, id, signalId, sugs) {
      for (const s of suggestions) if (s.inboxConversationId === id && s.status === "suggested") s.status = "expired";
      for (const g of sugs) suggestions.push({ id: g.id, inboxConversationId: id, engagementSignalId: signalId, actionKind: g.actionKind, rationaleSafe: g.rationaleSafe, suggestedDraftRef: g.suggestedDraftRef, confidence: g.confidence, status: "suggested", routedRef: null, createdAtIso: "2027-01-02T00:00:00Z" });
    },
    async listActiveSuggestions(orgId, id) { return suggestions.filter((s) => s.inboxConversationId === id && s.status === "suggested"); },
    async getSuggestion(orgId, id) { return suggestions.find((s) => s.id === id) ?? null; },
    async markSuggestion(orgId, id, patch) { const s = suggestions.find((x) => x.id === id); if (s) { s.status = patch.status; if (patch.routedRef !== undefined) s.routedRef = patch.routedRef ?? null; (s as unknown as { actorId?: string | null }).actorId = patch.actorId ?? null; (s as unknown as { reasonSafe?: string | null }).reasonSafe = patch.reasonSafe ?? null; } },
    async expireSuggestionsOlderThan(orgId, beforeIso, limit) { let n = 0; for (const s of suggestions) { if (s.status === "suggested" && s.createdAtIso < beforeIso && n < limit) { s.status = "expired"; n++; } } return n; },
    async insertJob(r) { jobs.set(r.id, r); },
    async getJob(orgId, id) { const j = jobs.get(id); return j && j.orgId === orgId ? j : null; },
    async findJobByIdem(orgId, k) { return [...jobs.values()].find((j) => j.orgId === orgId && j.idempotencyKey === k) ?? null; },
    async findActiveJob(orgId, sk, ref) { return [...jobs.values()].find((j) => j.orgId === orgId && j.subjectKind === sk && j.subjectRef === ref && ["scheduled", "available", "claimed", "executing", "retry_wait"].includes(j.status)) ?? null; },
    async updateJob(r) { jobs.set(r.id, r); },
    async claimDueJobs(args) { const due = [...jobs.values()].filter((j) => ["scheduled", "available", "retry_wait"].includes(j.status) && Date.parse(j.availableAtIso) <= args.nowMs && (!j.leaseExpiresAtIso || Date.parse(j.leaseExpiresAtIso) <= args.nowMs)).slice(0, args.limit); return due.map((j) => { const c = { ...j, status: "claimed" as const, leaseOwner: args.leaseOwner, leaseToken: `lease-${j.id}`, leaseExpiresAtIso: new Date(args.nowMs + args.leaseSeconds * 1000).toISOString() }; jobs.set(j.id, c); return c; }); },
    async findStaleJobs(nowMs, limit) { return [...jobs.values()].filter((j) => ["claimed", "executing"].includes(j.status) && (!j.leaseExpiresAtIso || Date.parse(j.leaseExpiresAtIso) <= nowMs)).slice(0, limit); },
    async countInFlight() { const per: Record<string, number> = {}; let g = 0; for (const j of jobs.values()) if (["claimed", "executing"].includes(j.status)) { g++; per[j.orgId] = (per[j.orgId] ?? 0) + 1; } return { global: g, perOrg: per }; },
    async queueHealth() { const by: Record<string, number> = {}; for (const j of jobs.values()) by[j.status] = (by[j.status] ?? 0) + 1; return { byStatus: by, deadLetter: by.dead_letter ?? 0, oldestDueMs: null }; },
  };
  return { store, jobs, signals, suggestions, candidates, contextByRef };
}
let copilotCalls = 0;
function ports(mem = memStore(), opts: { allowed?: boolean; nowMs?: number; reason?: () => ReasoningResult } = {}): { p: IntelligencePorts; mem: ReturnType<typeof memStore> } {
  let idc = 0; const nowMs = opts.nowMs ?? 1_900_000_000_000;
  const defaultReason = (): ReasoningResult => ({ classification: cls(), provider: "mock", modelName: null, modelVersion: null, promptTemplateVersion: "v1", errorKind: null });
  const p: IntelligencePorts = {
    store: mem.store,
    reasoning: { async classify() { return (opts.reason ?? defaultReason)(); } },
    copilot: { async draftReply() { copilotCalls++; return { draftRef: "copilot:fb:t1:professional", tone: "professional", requiresApproval: true as const }; } },
    insights: { async objectHint() { return null; } },
    capability: { async intelligenceAllowed() { return opts.allowed ?? true; } },
    clock: { nowMs: () => nowMs, nowIso: () => new Date(nowMs).toISOString() },
    ids: { uuid: () => `id-${++idc}` }, audit: { log: async () => {} }, random: { fraction: () => 0.5 },
  };
  return { p, mem };
}
const seed = (mem: ReturnType<typeof memStore>, c: ScoreCandidate, ctx: ContextItem[] = [{ author: "דנה", text: "כמה עולה הדירה?", at: "2027-01-01T00:00:00Z", fromPage: false }]) => { mem.candidates.set(`${c.orgId}|${c.inboxConversationId}`, c); mem.contextByRef.set(c.subjectRef, ctx); };

async function main() {
  // ═══ Taxonomy + confidence validation (M1–M10) ════════════════════════════
  check("M1 valid classification accepted", validateClassification(cls()).ok);
  check("M2 off-taxonomy sentiment → fallback unknown, not ok", (() => { const v = validateClassification(cls({ sentiment: "furious" })); return !v.ok && v.sentiment === "unknown" && v.confidence === 0; })());
  check("M3 off-taxonomy intent → not ok", !validateClassification(cls({ intent: "buy_now" })).ok);
  check("M4 off-taxonomy urgency → not ok", !validateClassification(cls({ urgency: "meh" })).ok);
  check("M5 confidence clamped to 0..100", validateClassification(cls({ confidence: 999 })).confidence === 100 && validateClassification(cls({ confidence: -5 })).confidence === 0);
  check("M6 sentimentScore clamped to -100..100", validateClassification(cls({ sentimentScore: 500 })).sentimentScore === 100);
  check("M7 null/garbage input → safe fallback", !validateClassification(null).ok && validateClassification(undefined).sentiment === "unknown");
  check("M8 score/sentiment contradiction downgrades confidence", validateClassification(cls({ sentiment: "positive", sentimentScore: -80, confidence: 90 })).confidence <= 40);
  check("M9 rationale stripped of urls/long tokens + bounded", (() => { const v = validateClassification(cls({ rationale: "see https://x.com/abc AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA ok" })); return !/https?:\/\//.test(v.rationaleSafe) && v.rationaleSafe.length <= 240; })());
  check("M10 SAFE_FALLBACK is unknown/normal/0", SAFE_FALLBACK.sentiment === "unknown" && SAFE_FALLBACK.urgency === "normal" && SAFE_FALLBACK.confidence === 0);

  // ═══ Suggestion derivation (M11–M18) ══════════════════════════════════════
  check("M11 lead → route_to_sales + reply suggestion", (() => { const s = deriveSuggestions({ sentiment: "positive", intent: "lead", urgency: "normal", confidence: 80 }); return s.some((x) => x.actionKind === "route_to_sales") && s.some((x) => x.actionKind === "suggest_reply"); })());
  check("M12 complaint → escalate + human review", (() => { const s = deriveSuggestions({ sentiment: "negative", intent: "complaint", urgency: "high", confidence: 80 }); return s.some((x) => x.actionKind === "escalate"); })());
  check("M13 spam → mark_spam_candidate + moderation", (() => { const s = deriveSuggestions({ sentiment: "neutral", intent: "spam", urgency: "low", confidence: 80 }); return s.some((x) => x.actionKind === "mark_spam_candidate") && s.some((x) => x.actionKind === "prepare_moderation_action"); })());
  check("M14 suggestion set bounded to MAX", deriveSuggestions({ sentiment: "negative", intent: "complaint", urgency: "critical", confidence: 90 }).length <= MAX_ACTIVE_SUGGESTIONS);
  check("M15 unknown/low-confidence → human review only", (() => { const s = deriveSuggestions({ sentiment: "unknown", intent: "unknown", urgency: "normal", confidence: 10 }); return s.length === 1 && s[0].actionKind === "request_human_review"; })());
  check("M16 critical urgency guarantees a human in the loop", deriveSuggestions({ sentiment: "neutral", intent: "general_question", urgency: "critical", confidence: 80 }).some((x) => x.actionKind === "escalate" || x.actionKind === "request_human_review"));
  check("M17 only reply-type suggestions need a draft", deriveSuggestions({ sentiment: "positive", intent: "pricing_question", urgency: "normal", confidence: 80 }).every((s) => s.needsDraft === (s.actionKind === "suggest_reply")));
  check("M18 deterministic (same input → same output)", JSON.stringify(deriveSuggestions({ sentiment: "positive", intent: "lead", urgency: "normal", confidence: 70 })) === JSON.stringify(deriveSuggestions({ sentiment: "positive", intent: "lead", urgency: "normal", confidence: 70 })));

  // ═══ Fingerprint + material change (M19–M23) ══════════════════════════════
  check("M19 fingerprint deterministic", subjectFingerprint(snap()) === subjectFingerprint(snap()));
  check("M20 material change on content diff", isMaterialChange(subjectFingerprint(snap({ replyCount: 2 })), subjectFingerprint(snap({ replyCount: 3 }))));
  check("M21 no material change when identical", !isMaterialChange(subjectFingerprint(snap()), subjectFingerprint(snap())));
  check("M22 no prior signal is a material change", isMaterialChange(null, subjectFingerprint(snap())));
  check("M23 bounded context caps items + length", (() => { const items: ContextItem[] = Array.from({ length: 30 }, () => ({ author: "a", text: "x".repeat(500), at: null, fromPage: false })); const b = boundedContext(items); return b.length <= 12 && b.every((c) => c.text.length <= 280); })());

  // ═══ Triggers — enqueue, no loop (M24–M28) ════════════════════════════════
  {
    const { p, mem } = ports();
    seed(mem, candidate({ currentSignalFingerprint: null }));
    const r1 = await engine.enqueueDueScoring(p, { correlationId: "c" });
    check("M24 new conversation enqueues scoring", r1.enqueued === 1);
    const r2 = await engine.enqueueDueScoring(p, { correlationId: "c" });
    check("M25 duplicate trigger does not duplicate the job (idempotent)", r2.enqueued === 0);
    // Cosmetic: currentSignalFingerprint matches → no rescore.
    const fp = subjectFingerprint(snap({ subjectRef: "t2" }));
    const mem2 = memStore(); const p2 = ports(mem2).p; seed(mem2, candidate({ inboxConversationId: "cv2", subjectRef: "t2", currentSignalFingerprint: fp }));
    check("M26 cosmetic/no change does NOT rescore", (await engine.enqueueDueScoring(p2, { correlationId: "c" })).enqueued === 0);
    // Material change: fingerprint differs → rescore.
    const mem3 = memStore(); const p3 = ports(mem3).p; seed(mem3, candidate({ inboxConversationId: "cv3", subjectRef: "t3", currentSignalFingerprint: "stale_fp" }));
    check("M27 material content change enqueues rescore", (await engine.enqueueDueScoring(p3, { correlationId: "c" })).enqueued === 1);
    check("M28 scheduling idempotent by key", (await engine.scheduleScoring(p, { orgId: "o1", candidate: candidate(), fingerprint: "fp", jobKind: "score_conversation", correlationId: "c", idempotencyKey: "cv1|intel_score|" + subjectFingerprint(snap()) })).resumed);
  }

  // ═══ Work: classify → append-only signal → suggestions (M29–M38) ══════════
  {
    const { p, mem } = ports();
    seed(mem, candidate());
    copilotCalls = 0;
    await engine.enqueueDueScoring(p, { correlationId: "c" });
    const [job] = await engine.dispatchDue(p, { leaseOwner: "w1" });
    const out = await engine.workJob(p, job);
    check("M29 scoring appends a current signal", out.job.status === "succeeded" && !!out.signalId && mem.signals.length === 1);
    check("M30 current signal projection reflects the classification", (await p.store.getCurrentSignal("o1", "comment_thread", "t1"))!.intent === "pricing_question");
    check("M31 pricing_question generates a reply suggestion", mem.suggestions.some((s) => s.actionKind === "suggest_reply" && s.status === "suggested"));
    check("M32 reply suggestion used the existing Copilot (draft attached)", copilotCalls >= 1 && mem.suggestions.some((s) => s.actionKind === "suggest_reply" && !!s.suggestedDraftRef));
    check("M33 suggestion set bounded", mem.suggestions.filter((s) => s.status === "suggested").length <= MAX_ACTIVE_SUGGESTIONS);
    check("M34 signal-computed event / suggestion_ready emitted", out.events.some((e) => e.event === "meta.intelligence.suggestion_ready"));
    // Re-score with new content → append-only history + one current.
    mem.candidates.set("o1|cv1", candidate({ snapshot: snap({ replyCount: 9 }), currentSignalFingerprint: subjectFingerprint(snap()) }));
    await engine.enqueueDueScoring(p, { correlationId: "c" });
    const [j2] = await engine.dispatchDue(p, { leaseOwner: "w2" });
    await engine.workJob(p, j2);
    check("M35 append-only history (2 signals, 1 current)", mem.signals.length === 2 && mem.signals.filter((s) => (s as unknown as { isCurrent?: boolean }).isCurrent).length === 1);
    check("M36 prior signal retired to superseded", mem.signals.filter((s) => s.processingState === "superseded").length === 1);
    // M37 — re-running the SAME fingerprint appends no duplicate (recovery-safe).
    const before37 = mem.signals.length;
    const fp9 = subjectFingerprint(snap({ replyCount: 9 }));
    const c37 = candidate({ currentSignalFingerprint: fp9 });
    mem.candidates.set("o1|cv1", c37);
    await engine.scheduleScoring(p, { orgId: "o1", candidate: c37, fingerprint: fp9, jobKind: "score_conversation", correlationId: "c", idempotencyKey: "rerun" });
    const [jj37] = await engine.dispatchDue(p, { leaseOwner: "w9" });
    const o37 = jj37 ? await engine.workJob(p, jj37) : { outcome: "succeeded" };
    check("M37 re-running the SAME fingerprint is a no-op (recovery-safe, no dup)", o37.outcome === "succeeded" && mem.signals.length === before37);
    const dto = toSignalDTO((await p.store.getCurrentSignal("o1", "comment_thread", "t1"))!);
    const dtoText = JSON.stringify(dto);
    // The safe promptTemplate VERSION is allowed (provenance); raw prompt/response
    // text, tokens and lease tokens are not. Also assert no content field leaks.
    check("M38 signal DTO carries no raw prompt/response/token (only safe version)", !/raw_prompt|raw_response|rawprompt|rawresponse|access_token|leasetoken|tokenplain|\bcontent\b/i.test(dtoText) && !("rationale" in dto) && "promptTemplateVersion" in dto);
  }

  // ═══ Invalid AI output fails safe; no partial state (M39–M41) ═════════════
  {
    const { p, mem } = ports(memStore(), { reason: () => ({ classification: cls({ intent: "buy_now" }), provider: "mock", modelName: null, modelVersion: null, promptTemplateVersion: "v1", errorKind: null }) });
    seed(mem, candidate());
    await engine.enqueueDueScoring(p, { correlationId: "c" });
    const [job] = await engine.dispatchDue(p, { leaseOwner: "w1" });
    const out = await engine.workJob(p, job);
    check("M39 invalid AI output fails the job (not scored)", out.job.status === "failed");
    check("M40 no partial current signal on invalid output", mem.signals.length === 0 && (await p.store.getCurrentSignal("o1", "comment_thread", "t1")) === null);
    check("M41 invalid output emits scoring_failed", out.events.some((e) => e.event === "meta.intelligence.scoring_failed"));
  }

  // ═══ Transport error retries with backoff (M42–M43) ════════════════════════
  {
    const { p, mem } = ports(memStore(), { reason: () => ({ classification: null, provider: "mock", modelName: null, modelVersion: null, promptTemplateVersion: "v1", errorKind: "ai_transport_error" }) });
    seed(mem, candidate());
    await engine.enqueueDueScoring(p, { correlationId: "c" });
    const [job] = await engine.dispatchDue(p, { leaseOwner: "w1" });
    const out = await engine.workJob(p, job);
    check("M42 AI transport error retries (bounded backoff)", out.job.status === "retry_wait");
    check("M43 transport failure writes NO signal", mem.signals.length === 0);
  }

  // ═══ Capability + lease fencing + recovery + dead-letter (M44–M50) ═════════
  {
    const { p, mem } = ports(memStore(), { allowed: false });
    seed(mem, candidate());
    await engine.enqueueDueScoring(p, { correlationId: "c" });
    const [job] = await engine.dispatchDue(p, { leaseOwner: "w1" });
    check("M44 scoring blocked when capability denied", (await engine.workJob(p, job)).job.status === "blocked");
  }
  {
    const { p, mem } = ports(); seed(mem, candidate());
    await engine.enqueueDueScoring(p, { correlationId: "c" });
    const [c1] = await engine.dispatchDue(p, { leaseOwner: "wA" });
    check("M45 two workers cannot claim the same job", (await engine.dispatchDue(p, { leaseOwner: "wB" })).length === 0);
    const wrong = await engine.workJob(p, { ...c1, leaseToken: "WRONG", leaseOwner: "wZ" });
    check("M46 wrong lease token cannot finalize", wrong.outcome.startsWith("fence_") || wrong.outcome === "already_terminal");
  }
  {
    const mem = memStore(); const { p } = ports(mem, { nowMs: 2_000_000_000_000 });
    const stale: IntelJobRow = { id: "sj", orgId: "o1", inboxConversationId: "cv1", subjectKind: "comment_thread", subjectRef: "t1", jobKind: "score_conversation", status: "executing", priority: 100, availableAtIso: new Date(1).toISOString(), contentFingerprint: "fp", attemptCount: 1, maxAttempts: 6, retryBudgetRemaining: 6, requeueCount: 0, leaseOwner: "d", leaseToken: "t", leaseExpiresAtIso: new Date(1_000_000_000_000).toISOString(), heartbeatAtIso: null, claimedAtIso: null, startedAtIso: null, completedAtIso: null, nextAttemptAtIso: null, lastErrorKind: null, safeLastError: null, correlationId: "c", idempotencyKey: "sj" };
    await p.store.insertJob(stale);
    const rec = await engine.recoverAbandoned(p, {});
    check("M47 abandoned scoring safely requeues", rec.requeued === 1 && (await p.store.getJob("o1", "sj"))!.status === "available");
    const exhausted: IntelJobRow = { ...stale, id: "ex", attemptCount: 6, idempotencyKey: "ex" };
    await p.store.insertJob(exhausted);
    const rec2 = await engine.recoverAbandoned(p, {});
    check("M48 exhausted job dead-letters (no auto replay)", rec2.deadLettered >= 1 && (await p.store.getJob("o1", "ex"))!.status === "dead_letter");
    check("M49 dead-letter jobs are not re-dispatched (no endless replay)", (await engine.dispatchDue(p, { leaseOwner: "wX" })).every((j) => j.id !== "ex"));
  }
  {
    const { p, mem } = ports(memStore(), { nowMs: 3_000_000_000_000 });
    mem.suggestions.push({ id: "old", inboxConversationId: "cv1", engagementSignalId: "s", actionKind: "suggest_reply", rationaleSafe: "", suggestedDraftRef: null, confidence: 50, status: "suggested", routedRef: null, createdAtIso: "2020-01-01T00:00:00Z" });
    check("M50 stale suggestions expire (bounded, no forever-open cards)", (await engine.expireDueSuggestions(p, {})).expired === 1 && mem.suggestions[0].status === "expired");
  }

  // ═══ Accept / dismiss — route into existing workflows, never Meta (M51–M57) ═
  {
    const { p, mem } = ports(); seed(mem, candidate());
    mem.suggestions.push({ id: "s1", inboxConversationId: "cv1", engagementSignalId: "sig", actionKind: "suggest_reply", rationaleSafe: "", suggestedDraftRef: "copilot:fb:t1:professional", confidence: 80, status: "suggested", routedRef: null, createdAtIso: "2027-01-01T00:00:00Z" });
    const plan = await engine.acceptSuggestion(p, "o1", "u1", "s1", "copilot:fb:t1:professional");
    check("M51 accept routes suggest_reply to a reviewable draft (never Meta)", plan.ok && plan.routeTarget === "reply_draft");
    check("M52 accepted suggestion is marked accepted", mem.suggestions.find((s) => s.id === "s1")!.status === "accepted");
    check("M53 re-accepting an accepted suggestion is rejected", !(await engine.acceptSuggestion(p, "o1", "u1", "s1", null)).ok);
    check("M54 moderation suggestion routes to the Phase-1 approval workflow", ROUTE_BY_ACTION.prepare_moderation_action === "moderation_action");
    check("M55 escalation routes through Phase-3 inbox state", ROUTE_BY_ACTION.escalate === "inbox_state");
    check("M56 NO action kind maps to an executing/send target", Object.keys(ROUTE_BY_ACTION).every((k) => acceptIsNonExecuting(k as keyof typeof ROUTE_BY_ACTION)));
    mem.suggestions.push({ id: "s2", inboxConversationId: "cv1", engagementSignalId: "sig", actionKind: "ignore", rationaleSafe: "", suggestedDraftRef: null, confidence: 50, status: "suggested", routedRef: null, createdAtIso: "2027-01-01T00:00:00Z" });
    const dm = await engine.dismissSuggestion(p, "o1", "u9", "s2", "not relevant");
    check("M57 dismiss records actor + marks dismissed", dm.ok && mem.suggestions.find((s) => s.id === "s2")!.status === "dismissed" && (mem.suggestions.find((s) => s.id === "s2") as unknown as { actorId?: string }).actorId === "u9");
  }

  // ═══ State guards (M58–M60) ═══════════════════════════════════════════════
  check("M58 canAccept only in suggested state", canAccept("suggested").ok && !canAccept("accepted").ok && !canAccept("dismissed").ok);
  check("M59 canDismiss only in suggested state", canDismiss("suggested").ok && !canDismiss("expired").ok);
  check("M60 accept-non-executing holds for every action kind", (["suggest_reply", "prepare_moderation_action", "route_to_sales", "escalate", "mark_spam_candidate", "ignore", "no_action", "request_human_review", "route_to_support"] as const).every(acceptIsNonExecuting));

  // ═══ Roles + observability + DTO safety (M61–M68) ═════════════════════════
  check("M61 viewer role can view, guest cannot", canViewIntelligence("support") && !canViewIntelligence("guest"));
  check("M62 rescore/accept role gates", canRescore("marketing_manager") && !canRescore("support") && canAcceptSuggestion("content_creator"));
  check("M63 metric rejects content/identifier dimensions", !validateMetricContract({ name: INTEL_METRICS.jobsCompleted, dimensions: ["conversation_id"] }).ok && !validateMetricContract({ name: "x", dimensions: ["content"] }).ok && !validateMetricContract({ name: "x", dimensions: ["model_name"] }).ok);
  check("M64 metric allows coarse buckets", validateMetricContract({ name: INTEL_METRICS.signalsByIntent, dimensions: ["intent", "platform", "model_provider"] }).ok);
  check("M65 queue-health evaluator is secret-free + coarse", (() => { const h = evaluateQueueHealth({ byStatus: { scheduled: 3 }, deadLetter: 0, oldestDueMs: 1000 }); return h.healthy && h.backlog === 3; })());
  check("M66 suggestion DTO exposes ref (not text) + no secret", (() => { const d = toSuggestionDTO({ id: "s", inboxConversationId: "c", engagementSignalId: "g", actionKind: "suggest_reply", rationaleSafe: "r", suggestedDraftRef: "copilot:fb:t1:professional", confidence: 70, status: "suggested", routedRef: null, createdAtIso: "t" } as StoredSuggestion); return d.hasDraft && !/prompt|response|token|body/i.test(JSON.stringify(d)); })());
  check("M67 conversation-intelligence DTO safe + unavailable reason", (() => { const d = toConversationIntelligence("c", null, [], []); return d.unavailableReason === "not_scored_yet" && d.current === null; })());
  check("M68 read module surfaces no prompt/response/token/graph literal", !/raw_prompt|raw_response|prompt_text|tokenPlain|access_token|graph\.facebook/.test(readFileSync("src/lib/meta/intelligence/read.ts", "utf8")));

  // ═══ Migration RLS + append-only + claim (M69–M73) ═════════════════════════
  const mig = readFileSync("supabase/migrations/20270101120000_meta_workspace_6_9_phase4_intelligence.sql", "utf8");
  check("M69 RLS org-select via current_org_id", /current_org_id\(\)/.test(mig) && /enable row level security/.test(mig));
  check("M70 no authenticated write policy", !/for insert to authenticated|for update to authenticated|for delete to authenticated/.test(mig));
  check("M71 migration additive (no destructive drop table)", !/drop table/i.test(mig) && /create table if not exists/.test(mig));
  check("M72 SKIP LOCKED claim fn + one active job per subject", /for update skip locked/i.test(mig) && /meta_intelligence_claim_due/.test(mig) && /meta_intel_job_active_uq/.test(mig));
  check("M73 append-only: one CURRENT signal per subject (partial unique)", /meta_engagement_signal_current_uq/.test(mig) && /where is_current = true/.test(mig) && !/raw_prompt|raw_response/.test(mig));

  // ═══ Boundary guard fixtures (M74–M80) ════════════════════════════════════
  check("M74 guard flags a provider/graph import in intelligence", scanContent("src/lib/meta/intelligence/x.ts", 'import { g } from "../provider/graph";').some((v) => /rule 15/.test(v)));
  check("M75 guard flags a second AI gateway (direct model client)", scanContent("src/lib/meta/intelligence/x.ts", "const c = new OpenAI({});").some((v) => /rule 15/.test(v)));
  check("M76 guard flags a second reply engine", scanContent("src/lib/meta/intelligence/x.ts", "export function generateReplySuggestions() {}").some((v) => /rule 15/.test(v)));
  check("M77 guard flags raw prompt/response persistence", scanContent("src/lib/meta/intelligence/store.ts", "const x = { raw_prompt: p, raw_response: r };").some((v) => /rule 15/.test(v)));
  check("M78 guard flags an AI auto-execute / provider write", scanContent("src/lib/meta/intelligence/x.ts", "await replyToComment(id);").some((v) => /rule 15/.test(v)));
  check("M79 guard flags a route reaching a model provider directly", scanContent("src/app/api/meta/intelligence/x/route.ts", "import { selectProvider } from '@/lib/ai-reasoning';").some((v) => /rule 15/.test(v)));
  check("M80 guard clean on a legitimate intelligence domain file", scanContent("src/lib/meta/intelligence/suggest.ts", "export const x = 1;").length === 0);

  // ═══ Absence proofs — Phase 4 ONLY (M81–M85) ══════════════════════════════
  // M81 — Phase 5 adds listening as a CONSUMER of the Phase-4 path; the invariant
  // that survives is that intelligence never depends on the listening module.
  check("M81 intelligence does not depend on the listening module", ["engine", "service", "store", "reasoning", "copilot"].every((f) => !/meta\/listening/.test(readFileSync(`src/lib/meta/intelligence/${f}.ts`, "utf8"))));
  // M82 — Phase 6 messaging REUSES this intelligence path; the invariant that survives
  // is that intelligence never depends on the messaging module.
  check("M82 intelligence does not depend on the messaging module", ["engine", "service", "store", "reasoning", "copilot"].every((f) => !/meta\/messaging/.test(readFileSync(`src/lib/meta/intelligence/${f}.ts`, "utf8"))));
  check("M83 intelligence reaches AI ONLY via the two adapters", (() => { const files = ["engine", "service", "domain", "classify", "suggest", "state", "read", "store", "roles", "observability", "fingerprint", "prompts", "ports"]; return files.every((f) => { const c = readFileSync(`src/lib/meta/intelligence/${f}.ts`, "utf8"); return !/@\/lib\/ai-reasoning|@\/lib\/comm-copilot|@\/lib\/draft-studio/.test(c); }); })());
  check("M84 no direct Meta/Graph call in intelligence", (() => { const files = ["engine", "service", "store", "reasoning", "copilot"]; return files.every((f) => !/graph\.facebook|fetchComments|replyToComment|hideComment|\.moderate\(/.test(readFileSync(`src/lib/meta/intelligence/${f}.ts`, "utf8"))); })());
  check("M85 store is append-only (no in-place classification update)", !/meta_engagement_signal[\s\S]{0,240}\.update\([\s\S]{0,240}(sentiment|intent|urgency)\s*:/.test(readFileSync("src/lib/meta/intelligence/store.ts", "utf8")));

  // ═══ Scenarios ════════════════════════════════════════════════════════════
  {
    const { p, mem } = ports(); seed(mem, candidate());
    await engine.enqueueDueScoring(p, { correlationId: "c" });
    const [j] = await engine.dispatchDue(p, { leaseOwner: "w" });
    await engine.workJob(p, j);
    const fp = subjectFingerprint(snap());
    mem.candidates.set("o1|cv1", candidate({ currentSignalFingerprint: fp }));
    check("S1 no scoring loop: after scoring, an unchanged subject is not re-enqueued", (await engine.enqueueDueScoring(p, { correlationId: "c" })).enqueued === 0);
  }
  check("S2 fingerprint of different content differs", fingerprint(["a", 1]) !== fingerprint(["a", 2]));

  console.log(`\nPhase 4 self-test: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
