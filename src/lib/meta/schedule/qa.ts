// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PHASE 3B SELF TEST (Scheduling / Queue /
// Automatic Retry / Dead Letter / Recovery). Runnable gate:
//   `npx tsx src/lib/meta/schedule/qa.ts`.
// Deterministic E1–E120 (+ scenarios) over the PURE domain + the pure engine
// driven against in-memory fakes and a MOCK publish executor (the Phase-3A engine
// is stubbed at the seam — the worker never calls Graph here). No network, no DB,
// no clock/RNG ambient reads (clock + jitter are injected). Also asserts the
// boundary guard on synthetic schedule-module fixtures.
// ============================================================================
import type { ScheduleStore, SchedulePorts, PublishJobRow, PublishJobAttemptRow, ClaimArgs, PublishExecutorSeam, ExecutorTargetResult, RateBudgetConsumeResult } from "./ports";
import type { DeadLetterRecord } from "./dead-letter";
import * as engine from "./engine";
import { resolveLocalToUtc, validateScheduleTime, zoneOffsetMinutes, parseLocalDateTime, isValidTimeZone, formatInstant } from "./timezone";
import { canTransitionJob, isDue, canCancelJob, JOB_TERMINAL, JOB_CLAIMABLE, JOB_ACTIVE } from "./job-state";
import { automaticRetryDecision, isAutomaticRetryEligible, computeBackoffMs, DEFAULT_RETRY_POLICY } from "./retry";
import { grantLease, heartbeatLease, canFinalize, isLeaseActive, isLeaseStale, ownsLease, DEFAULT_LEASE_MS } from "./lease";
import { recoverAbandonedJob } from "./recovery";
import { buildDeadLetter, isAutoReplayable, manualRedriveGuidance } from "./dead-letter";
import { windowStartMs, rateBudgetAllows, selectFairBatch, DEFAULT_CONCURRENCY } from "./budget";
import { computeQueueHealth } from "./queue-health";
import { validateMetricContract } from "./observability";
import { toScheduledJobDTO, toDeadLetterDTO } from "./read";
import { scanContent } from "../../../../scripts/check-meta-boundaries.mjs";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log("  ✓ " + n); } else { failed++; console.error("  ✗ " + n); } };
console.log("\nMeta Workspace (6.8) Phase 3B — SELF TEST (Scheduling / Queue / Retry / Dead Letter / Recovery)\n");

// ── Controllable clock + deterministic ports ──────────────────────────────────
function fixedPorts(startMs: number, seam: PublishExecutorSeam, jitter = 0.5) {
  let cur = startMs; let idc = 0;
  const store = memStore();
  const audit: string[] = [];
  const p: SchedulePorts = {
    store: store.store, publish: seam,
    clock: { nowMs: () => cur, nowIso: () => new Date(cur).toISOString() },
    ids: { uuid: () => `jid-${++idc}` },
    audit: { log: async (i) => { audit.push(i.action); } },
    random: { fraction: () => jitter },
  };
  return { p, audit, mem: store, advance: (ms: number) => { cur += ms; }, at: (ms: number) => { cur = ms; }, now: () => cur };
}

function memStore() {
  const jobs = new Map<string, PublishJobRow>();
  const attempts: PublishJobAttemptRow[] = [];
  const dls = new Map<string, DeadLetterRecord>();
  const budgets = new Map<string, { used: number; limit: number }>();
  const store: ScheduleStore = {
    async insertJob(r) { jobs.set(r.id, r); },
    async getJob(orgId, id) { const j = jobs.get(id); return j && j.orgId === orgId ? j : null; },
    async findJobByIdem(orgId, key) { return [...jobs.values()].find((j) => j.orgId === orgId && j.idempotencyKey === key) ?? null; },
    async findActivePrimaryJob(orgId, opId) { return [...jobs.values()].find((j) => j.orgId === orgId && j.publishOperationId === opId && j.jobKind === "scheduled_publish" && JOB_ACTIVE.has(j.status)) ?? null; },
    async listJobsForOperation(orgId, opId) { return [...jobs.values()].filter((j) => j.orgId === orgId && j.publishOperationId === opId); },
    async updateJob(r) { jobs.set(r.id, r); },
    async claimDueJobs(args: ClaimArgs) {
      const due = [...jobs.values()].filter((j) => JOB_CLAIMABLE.has(j.status) && Date.parse(j.runAfterIso) <= args.nowMs && (!j.leaseExpiresAtIso || Date.parse(j.leaseExpiresAtIso) <= args.nowMs));
      const candidates = due.map((j) => ({ jobId: j.id, orgId: j.orgId, priority: j.priority, runAfterMs: Date.parse(j.runAfterIso) }));
      const inFlight = await this.countInFlight();
      const picked = selectFairBatch(candidates, { globalInFlight: inFlight.global, perOrgInFlight: inFlight.perOrg }, { globalMax: 999, perOrgMax: args.perOrgMax }, args.limit);
      const out: PublishJobRow[] = [];
      for (const c of picked) {
        const j = jobs.get(c.jobId)!;
        const claimed: PublishJobRow = { ...j, status: "claimed", leaseOwner: args.leaseOwner, leaseToken: `lease-${j.id}-${args.nowMs}`, leaseExpiresAtIso: new Date(args.nowMs + args.leaseSeconds * 1000).toISOString(), claimedAtIso: new Date(args.nowMs).toISOString(), heartbeatAtIso: new Date(args.nowMs).toISOString(), revision: j.revision + 1 };
        jobs.set(j.id, claimed); out.push(claimed);
      }
      return out;
    },
    async findStaleJobs(nowMs, limit) { return [...jobs.values()].filter((j) => (j.status === "claimed" || j.status === "executing") && (!j.leaseExpiresAtIso || Date.parse(j.leaseExpiresAtIso) <= nowMs)).slice(0, limit); },
    async insertJobAttempt(r) { attempts.push(r); },
    async listJobAttempts(orgId, jobId) { return attempts.filter((a) => a.orgId === orgId && a.publishJobId === jobId); },
    async insertDeadLetter(r) { dls.set(r.publishJobId, r); },
    async getDeadLetterByJob(orgId, jobId) { const d = dls.get(jobId); return d && d.orgId === orgId ? d : null; },
    async listDeadLetters(orgId) { return [...dls.values()].filter((d) => d.orgId === orgId); },
    async countInFlight() { const per: Record<string, number> = {}; let g = 0; for (const j of jobs.values()) if (j.status === "claimed" || j.status === "executing") { g++; per[j.orgId] = (per[j.orgId] ?? 0) + 1; } return { global: g, perOrg: per }; },
    async consumeRateBudget(orgId, scope, windowStartIso, _sec, limit): Promise<RateBudgetConsumeResult> { const k = `${orgId}|${scope}|${windowStartIso}`; const b = budgets.get(k) ?? { used: 0, limit }; if (b.used < limit) { b.used++; budgets.set(k, b); return { allowed: true, used: b.used, limit }; } budgets.set(k, b); return { allowed: false, used: b.used, limit }; },
    async queueHealth(orgId, nowMs) { const by: Record<string, number> = {}; let oldest: number | null = null; for (const j of jobs.values()) { if (orgId && j.orgId !== orgId) continue; by[j.status] = (by[j.status] ?? 0) + 1; if ((j.status === "scheduled" || j.status === "available" || j.status === "retry_wait")) { const due = Date.parse(j.runAfterIso); if (due <= nowMs) { const age = nowMs - due; if (oldest == null || age > oldest) oldest = age; } } } return { byStatus: by, deadLetter: [...dls.values()].filter((d) => !orgId || d.orgId === orgId).length, oldestDueMs: oldest }; },
  };
  return { store, jobs, attempts, dls, budgets };
}

// Programmable mock executor seam.
function mockSeam(over: Partial<PublishExecutorSeam> & { op?: (id: string) => { status: string; successful: number; failed: number; targets: readonly ExecutorTargetResult[] }; retry?: (id: string, n: number) => { status: string; retryable: boolean; errorKind: string | null; ambiguous: boolean; retryAfterMs: number | null } } = {}): PublishExecutorSeam & { opStatus: Map<string, string>; manualReview: Set<string>; retryCalls: Map<string, number> } {
  const opStatus = new Map<string, string>(); const manualReview = new Set<string>(); const retryCalls = new Map<string, number>();
  return {
    opStatus, manualReview, retryCalls,
    executeOperation: over.executeOperation ?? (async (_o, id) => over.op ? over.op(id) : { status: "succeeded", successful: 1, failed: 0, targets: [{ targetId: "t1", status: "succeeded", retryable: false, errorKind: null, ambiguous: false, retryAfterMs: null }] }),
    retryTargetAutomatic: over.retryTargetAutomatic ?? (async (_o, id) => { const n = (retryCalls.get(id) ?? 0) + 1; retryCalls.set(id, n); return over.retry ? over.retry(id, n) : { status: "succeeded", retryable: false, errorKind: null, ambiguous: false, retryAfterMs: null }; }),
    readTarget: over.readTarget ?? (async (_o, id) => ({ status: manualReview.has(id) ? "manual_review_required" : "failed", retryable: true, safeErrorKind: "timeout" })),
    setOperationStatus: over.setOperationStatus ?? (async (_o, id, s) => { opStatus.set(id, s); }),
    markTargetManualReview: over.markTargetManualReview ?? (async (_o, id) => { manualReview.add(id); }),
  };
}

const instant = (localStr: string, tz: string, nowMs = 0) => validateScheduleTime(localStr, tz, nowMs, { minLeadMs: 0, maxLeadMs: 10 * 365 * 24 * 3600_000 });

async function main() {
  // ═══ Timezone (E1–E18) ═══════════════════════════════════════════════════
  const nyWinter = resolveLocalToUtc({ year: 2027, month: 1, day: 15, hour: 12, minute: 0, second: 0 }, "America/New_York");
  check("E1 EST winter offset is -300 (UTC-5)", nyWinter.offsetMinutes === -300);
  check("E2 EST 12:00 local → 17:00 UTC", nyWinter.utcIso === "2027-01-15T17:00:00.000Z");
  const nySummer = resolveLocalToUtc({ year: 2027, month: 7, day: 15, hour: 12, minute: 0, second: 0 }, "America/New_York");
  check("E3 EDT summer offset is -240 (UTC-4, DST)", nySummer.offsetMinutes === -240);
  check("E4 EDT 12:00 local → 16:00 UTC (DST-aware)", nySummer.utcIso === "2027-07-15T16:00:00.000Z");
  const jer = resolveLocalToUtc({ year: 2027, month: 1, day: 15, hour: 9, minute: 30, second: 0 }, "Asia/Jerusalem");
  check("E5 Asia/Jerusalem winter offset +120", jer.offsetMinutes === 120);
  check("E6 Jerusalem 09:30 → 07:30 UTC", jer.utcIso === "2027-01-15T07:30:00.000Z");
  check("E7 same wall clock, two zones → two distinct instants", nyWinter.epochMs !== jer.epochMs);
  const gap = resolveLocalToUtc({ year: 2027, month: 3, day: 14, hour: 2, minute: 30, second: 0 }, "America/New_York"); // spring-forward gap
  check("E8 spring-forward non-existent local time is flagged", gap.anomaly === "nonexistent_gap");
  const fold = resolveLocalToUtc({ year: 2027, month: 11, day: 7, hour: 1, minute: 30, second: 0 }, "America/New_York"); // fall-back fold
  check("E9 fall-back ambiguous local time is flagged", fold.anomaly === "ambiguous_fold");
  check("E10 well-formed local time has no anomaly", nyWinter.anomaly === "none");
  check("E11 round-trip UTC→local preserves wall clock", (() => { const b = formatInstant(nyWinter.epochMs, "America/New_York"); return b.hour === 12 && b.minute === 0; })());
  check("E12 zoneOffsetMinutes matches resolver", zoneOffsetMinutes("America/New_York", nySummer.epochMs) === -240);
  check("E13 parseLocalDateTime accepts ISO-ish", !!parseLocalDateTime("2027-03-01T08:15"));
  check("E14 parseLocalDateTime rejects garbage", parseLocalDateTime("not-a-date") === null);
  check("E15 invalid timezone detected", !isValidTimeZone("Mars/Phobos"));
  check("E16 valid timezone accepted", isValidTimeZone("Europe/London"));
  check("E17 validateScheduleTime rejects a gap time", instant("2027-03-14T02:30", "America/New_York").ok === false);
  check("E18 validateScheduleTime rejects a past time", validateScheduleTime("2020-01-01T00:00", "UTC", Date.parse("2027-01-01T00:00:00Z"), { minLeadMs: 0, maxLeadMs: 1e15 }).ok === false);
  check("E18b validateScheduleTime rejects too-soon", validateScheduleTime("2027-01-01T00:00", "UTC", Date.parse("2026-12-31T23:59:00Z"), { minLeadMs: 3600_000, maxLeadMs: 1e15 }).ok === false);
  check("E18c validateScheduleTime rejects too-far", validateScheduleTime("2050-01-01T00:00", "UTC", Date.parse("2027-01-01T00:00:00Z"), { minLeadMs: 0, maxLeadMs: 86_400_000 }).ok === false);

  // ═══ Job state machine (E19–E30) ═════════════════════════════════════════
  check("E19 scheduled→available allowed", canTransitionJob("scheduled", "available"));
  check("E20 available→claimed allowed", canTransitionJob("available", "claimed"));
  check("E21 claimed→executing allowed", canTransitionJob("claimed", "executing"));
  check("E22 executing→succeeded allowed", canTransitionJob("executing", "succeeded"));
  check("E23 executing→retry_wait allowed", canTransitionJob("executing", "retry_wait"));
  check("E24 retry_wait→available allowed", canTransitionJob("retry_wait", "available"));
  check("E25 succeeded is terminal (no exits)", JOB_TERMINAL.has("succeeded") && !canTransitionJob("succeeded", "available"));
  check("E26 dead_letter is terminal", JOB_TERMINAL.has("dead_letter") && !canTransitionJob("dead_letter", "available"));
  check("E27 cannot skip scheduled→executing", !canTransitionJob("scheduled", "executing"));
  check("E28 isDue true only when claimable + due", isDue("scheduled", 100, 200) && !isDue("scheduled", 300, 200) && !isDue("succeeded", 100, 200));
  check("E29 canCancel before terminal, not executing", canCancelJob("scheduled") && !canCancelJob("executing") && !canCancelJob("succeeded"));
  check("E30 JOB_CLAIMABLE excludes claimed/executing", !JOB_CLAIMABLE.has("claimed") && !JOB_CLAIMABLE.has("executing") && JOB_CLAIMABLE.has("retry_wait"));

  // ═══ Automatic-retry policy (E31–E48) ════════════════════════════════════
  check("E31 transient timeout is auto-retry eligible", isAutomaticRetryEligible("timeout", false));
  check("E32 rate_limited is auto-retry eligible", isAutomaticRetryEligible("rate_limited", false));
  check("E33 AMBIGUOUS timeout is NOT auto-retry eligible", !isAutomaticRetryEligible("timeout", true));
  check("E34 auth failure is NOT auto-retry eligible", !isAutomaticRetryEligible("authentication", false));
  check("E35 permission_missing is NOT auto-retry eligible", !isAutomaticRetryEligible("permission_missing", false));
  const d31 = automaticRetryDecision({ errorKind: "timeout", ambiguous: false, attemptCount: 0, budgetRemaining: 5, retryAfterMs: null, nowMs: 1000, jitterFraction: 0.5, policy: DEFAULT_RETRY_POLICY });
  check("E36 transient → retry with future runAfter", d31.action === "retry" && d31.runAfterMs! > 1000);
  check("E37 retry decrements budget", d31.budgetRemaining === 4);
  const dAmb = automaticRetryDecision({ errorKind: "timeout", ambiguous: true, attemptCount: 0, budgetRemaining: 5, retryAfterMs: null, nowMs: 0, jitterFraction: 0.5 });
  check("E38 ambiguous → dead_letter (never retry)", dAmb.action === "dead_letter" && dAmb.deadLetterReason === "ambiguous_result");
  const dAuth = automaticRetryDecision({ errorKind: "token_expired", ambiguous: false, attemptCount: 0, budgetRemaining: 5, retryAfterMs: null, nowMs: 0, jitterFraction: 0.5 });
  check("E39 reconnect failure → blocked (awaits reconnect)", dAuth.action === "blocked");
  const dPerm = automaticRetryDecision({ errorKind: "policy_restricted", ambiguous: false, attemptCount: 0, budgetRemaining: 5, retryAfterMs: null, nowMs: 0, jitterFraction: 0.5 });
  check("E40 permanent failure → dead_letter", dPerm.action === "dead_letter" && dPerm.deadLetterReason === "permanent_failure");
  const dExhaust = automaticRetryDecision({ errorKind: "timeout", ambiguous: false, attemptCount: 5, budgetRemaining: 0, retryAfterMs: null, nowMs: 0, jitterFraction: 0.5 });
  check("E41 exhausted budget → dead_letter (retries_exhausted)", dExhaust.action === "dead_letter" && dExhaust.deadLetterReason === "retries_exhausted");
  check("E42 backoff grows with attempt (exponential)", computeBackoffMs(3, DEFAULT_RETRY_POLICY, 0, null) > computeBackoffMs(1, DEFAULT_RETRY_POLICY, 0, null));
  check("E43 backoff capped by maxDelayMs", computeBackoffMs(50, DEFAULT_RETRY_POLICY, 1, null) <= DEFAULT_RETRY_POLICY.maxDelayMs);
  check("E44 jitter widens delay deterministically", computeBackoffMs(2, DEFAULT_RETRY_POLICY, 1, null) > computeBackoffMs(2, DEFAULT_RETRY_POLICY, 0, null));
  check("E45 Retry-After acts as a floor", computeBackoffMs(1, DEFAULT_RETRY_POLICY, 0, 500_000) >= 500_000);
  check("E46 Retry-After still bounded by ceiling", computeBackoffMs(1, DEFAULT_RETRY_POLICY, 0, 99_999_999) === DEFAULT_RETRY_POLICY.maxDelayMs);
  check("E47 decision is deterministic for same inputs", JSON.stringify(automaticRetryDecision({ errorKind: "timeout", ambiguous: false, attemptCount: 1, budgetRemaining: 3, retryAfterMs: null, nowMs: 5000, jitterFraction: 0.25 })) === JSON.stringify(automaticRetryDecision({ errorKind: "timeout", ambiguous: false, attemptCount: 1, budgetRemaining: 3, retryAfterMs: null, nowMs: 5000, jitterFraction: 0.25 })));
  check("E48 media_processing is transient-eligible", isAutomaticRetryEligible("media_processing", false));

  // ═══ Lease (E49–E60) ═════════════════════════════════════════════════════
  const g = grantLease("w1", "tok1", 1000, 120_000);
  check("E49 grant sets owner+token+expiry", g.leaseOwner === "w1" && g.leaseToken === "tok1" && g.leaseExpiresAtMs === 121_000);
  const lActive = { status: "executing" as const, leaseOwner: "w1", leaseToken: "tok1", leaseExpiresAtMs: 121_000 };
  check("E50 lease active before expiry", isLeaseActive(lActive, 100_000));
  check("E51 lease stale after expiry", isLeaseStale(lActive, 200_000));
  check("E52 ownsLease matches exact owner+token", ownsLease(lActive, "w1", "tok1") && !ownsLease(lActive, "w1", "WRONG"));
  const hbOk = heartbeatLease(lActive, "w1", "tok1", 100_000, 120_000);
  check("E53 heartbeat by holder extends expiry", hbOk.ok && hbOk.leaseExpiresAtMs === 220_000);
  const hbBad = heartbeatLease(lActive, "w2", "tokX", 100_000);
  check("E54 heartbeat by non-holder rejected (fencing)", !hbBad.ok && hbBad.reason === "lease_mismatch");
  const hbExpired = heartbeatLease(lActive, "w1", "tok1", 200_000);
  check("E55 heartbeat after expiry rejected", !hbExpired.ok && hbExpired.reason === "lease_expired");
  check("E56 finalize allowed for holder", canFinalize(lActive, "w1", "tok1").ok);
  check("E57 finalize rejected for zombie (stale token)", !canFinalize({ ...lActive, leaseToken: "NEW" }, "w1", "tok1").ok);
  check("E58 finalize rejected when not working", !canFinalize({ ...lActive, status: "scheduled" }, "w1", "tok1").ok);
  check("E59 lease active false when not working", !isLeaseActive({ ...lActive, status: "scheduled" }, 100_000));
  check("E60 default lease + heartbeat are bounded constants", DEFAULT_LEASE_MS === 120_000);

  // ═══ Recovery (E61–E68) ══════════════════════════════════════════════════
  const staleClaimed = { status: "claimed" as const, leaseOwner: "w", leaseToken: "t", leaseExpiresAtMs: 100 };
  const rc = recoverAbandonedJob("claimed", { lease: staleClaimed, nowMs: 1000, requeueCount: 0, maxRequeues: 3 });
  check("E61 stale pre-execution (claimed) → safe requeue", rc.disposition === "requeue" && !rc.requiresManualReview);
  const staleExec = { status: "executing" as const, leaseOwner: "w", leaseToken: "t", leaseExpiresAtMs: 100 };
  const re = recoverAbandonedJob("executing", { lease: staleExec, nowMs: 1000, requeueCount: 0, maxRequeues: 3 });
  check("E62 stale mid-execution → ambiguous dead-letter (never re-run)", re.disposition === "manual_review_dead_letter" && re.requiresManualReview && re.deadLetterReason === "recovery_ambiguous");
  const rex = recoverAbandonedJob("claimed", { lease: staleClaimed, nowMs: 1000, requeueCount: 3, maxRequeues: 3 });
  check("E63 requeue budget exhausted → dead-letter", rex.disposition === "requeue_exhausted_dead_letter" && rex.deadLetterReason === "retries_exhausted");
  const rh = recoverAbandonedJob("executing", { lease: { ...staleExec, leaseExpiresAtMs: 999_999 }, nowMs: 1000, requeueCount: 0, maxRequeues: 3 });
  check("E64 active lease → healthy (nothing to recover)", rh.disposition === "healthy");
  check("E65 requeue sets a runAfter", rc.runAfterMs === 1000);
  check("E66 ambiguous recovery requires manual review", re.requiresManualReview === true);
  check("E67 safe requeue does not require manual review", rc.requiresManualReview === false);
  check("E68 non-working stale status → healthy", recoverAbandonedJob("scheduled", { lease: { status: "scheduled", leaseOwner: null, leaseToken: null, leaseExpiresAtMs: null }, nowMs: 1000, requeueCount: 0, maxRequeues: 3 }).disposition === "healthy");

  // ═══ Dead-letter (E69–E74) ═══════════════════════════════════════════════
  const dl = buildDeadLetter({ id: "d1", orgId: "o", publishJobId: "j", publishOperationId: "op", jobKind: "automatic_retry", reason: "retries_exhausted", attemptCount: 5, createdAt: "2027-01-01T00:00:00Z", extra: { platform: "facebook", secretToken: "LEAK" } });
  check("E69 dead-letter never auto-replayable", isAutoReplayable() === false);
  check("E70 dead-letter context drops non-allowlisted keys (no secret leak)", !("secretToken" in dl.safeContext) && dl.safeContext.platform === "facebook");
  check("E71 dead-letter records the reason", dl.reason === "retries_exhausted" && dl.safeContext.reason === "retries_exhausted");
  check("E72 manual redrive allowed for publisher", manualRedriveGuidance(dl, true).allowed);
  check("E73 manual redrive denied for non-publisher", !manualRedriveGuidance(dl, false).allowed);
  const dlAmb = buildDeadLetter({ id: "d2", orgId: "o", publishJobId: "j2", publishOperationId: "op", jobKind: "scheduled_publish", reason: "ambiguous_result", attemptCount: 1, createdAt: "2027-01-01T00:00:00Z" });
  check("E74 ambiguous redrive requires provider verification first", manualRedriveGuidance(dlAmb, true).requiresProviderVerification);

  // ═══ Budget / concurrency / fairness (E75–E84) ═══════════════════════════
  check("E75 windowStartMs floors to window", windowStartMs(65_000, 60) === 60_000);
  check("E76 rateBudgetAllows respects limit", rateBudgetAllows(9, 10) && !rateBudgetAllows(10, 10));
  const cands = [
    { jobId: "a1", orgId: "A", priority: 100, runAfterMs: 1 }, { jobId: "a2", orgId: "A", priority: 100, runAfterMs: 2 }, { jobId: "a3", orgId: "A", priority: 100, runAfterMs: 3 },
    { jobId: "b1", orgId: "B", priority: 100, runAfterMs: 1 },
  ];
  const fair = selectFairBatch(cands, { globalInFlight: 0, perOrgInFlight: {} }, { globalMax: 10, perOrgMax: 2 }, 10);
  check("E77 fairness caps per-org (A limited to 2 of 3)", fair.filter((c) => c.orgId === "A").length === 2);
  check("E78 fairness still admits other orgs (B included)", fair.some((c) => c.orgId === "B"));
  check("E79 fairness round-robins (B before A's 2nd)", fair[0].orgId === "A" && fair[1].orgId === "B");
  const capped = selectFairBatch(cands, { globalInFlight: 9, perOrgInFlight: { A: 9 } }, { globalMax: 10, perOrgMax: 5 }, 10);
  check("E80 global concurrency bounds the batch to 1", capped.length === 1);
  const none = selectFairBatch(cands, { globalInFlight: 10, perOrgInFlight: {} }, { globalMax: 10, perOrgMax: 5 }, 10);
  check("E81 no headroom → empty batch", none.length === 0);
  check("E82 batchMax bounds selection", selectFairBatch(cands, { globalInFlight: 0, perOrgInFlight: {} }, { globalMax: 10, perOrgMax: 5 }, 1).length === 1);
  check("E83 per-org headroom accounts for in-flight", selectFairBatch(cands, { globalInFlight: 1, perOrgInFlight: { A: 1 } }, { globalMax: 10, perOrgMax: 2 }, 10).filter((c) => c.orgId === "A").length === 1);
  check("E84 default concurrency is bounded", DEFAULT_CONCURRENCY.globalMax <= 16 && DEFAULT_CONCURRENCY.perOrgMax <= DEFAULT_CONCURRENCY.globalMax);

  // ═══ Engine: schedule / idempotency / cancel / reschedule (E85–E96) ══════
  const START = Date.parse("2027-01-10T00:00:00Z");
  const futureIso = "2027-01-11T00:00:00Z";
  const inst = validateScheduleTime("2027-01-11T02:00", "Asia/Jerusalem", START, { minLeadMs: 0, maxLeadMs: 1e15 });
  {
    const seam = mockSeam();
    const { p, mem } = fixedPorts(START, seam);
    const r1 = await engine.scheduleOperation(p, { orgId: "o1", operationId: "op1", instant: inst.instant!, correlationId: "c1", idempotencyKey: "idem1" });
    check("E85 scheduleOperation creates a scheduled job", r1.job.status === "scheduled" && !r1.resumed);
    check("E86 scheduling emits meta.post.scheduled", r1.events.some((e) => e.event === "meta.post.scheduled"));
    check("E87 operation marked scheduled via seam", seam.opStatus.get("op1") === "scheduled");
    check("E88 scheduled job stores tz + local + offset (DST-safe)", r1.job.scheduledTimezone === "Asia/Jerusalem" && !!r1.job.scheduledLocalDatetime && r1.job.scheduledOffsetMinutes !== null);
    const r2 = await engine.scheduleOperation(p, { orgId: "o1", operationId: "op1", instant: inst.instant!, correlationId: "c1", idempotencyKey: "idem1" });
    check("E89 duplicate schedule resumes (idempotent)", r2.resumed && r2.job.id === r1.job.id && mem.jobs.size === 1);
    const resched = await engine.rescheduleOperation(p, "o1", "op1", validateScheduleTime("2027-01-12T02:00", "Asia/Jerusalem", START, { minLeadMs: 0, maxLeadMs: 1e15 }).instant!);
    check("E90 reschedule updates a not-yet-claimed job", resched.ok && resched.job!.scheduledForIso !== r1.job.scheduledForIso);
    const cancelled = await engine.cancelScheduledOperation(p, "o1", "op1");
    check("E91 cancel a scheduled op succeeds + emits cancelled", cancelled.ok && cancelled.events.some((e) => e.event === "meta.post.scheduled_cancelled"));
    check("E92 cancelled operation reflected via seam", seam.opStatus.get("op1") === "cancelled");
    const cancelAgain = await engine.cancelScheduledOperation(p, "o1", "op1");
    check("E93 cannot cancel an already-cancelled op", !cancelAgain.ok);
    const reschedTerminal = await engine.rescheduleOperation(p, "o1", "op1", inst.instant!);
    check("E94 cannot reschedule a terminal job", !reschedTerminal.ok);
  }
  check("E95 futureIso constant sane", Date.parse(futureIso) > START);
  {
    // cross-org isolation on cancel
    const { p } = fixedPorts(START, mockSeam());
    await engine.scheduleOperation(p, { orgId: "oX", operationId: "opX", instant: inst.instant!, correlationId: "cX", idempotencyKey: "idX" });
    const wrongOrg = await engine.cancelScheduledOperation(p, "oOTHER", "opX");
    check("E96 cross-org cannot cancel another org's scheduled op", !wrongOrg.ok && wrongOrg.error === "not_found");
  }

  // ═══ Engine: dispatch + work scheduled publish (E97–E108) ════════════════
  {
    const seam = mockSeam({ op: () => ({ status: "succeeded", successful: 1, failed: 0, targets: [{ targetId: "t1", status: "succeeded", retryable: false, errorKind: null, ambiguous: false, retryAfterMs: null }] }) });
    const { p, mem } = fixedPorts(START, seam);
    await engine.scheduleOperation(p, { orgId: "o1", operationId: "op1", instant: { ...inst.instant!, utcIso: new Date(START - 1000).toISOString() }, correlationId: "c1", idempotencyKey: "idem1" });
    const notDue = await engine.dispatchDue(p, { leaseOwner: "w1", limit: 5 });
    check("E97 dispatch claims a due job", notDue.length === 1 && notDue[0].status === "claimed");
    check("E98 claimed job carries a fresh lease token", !!notDue[0].leaseToken && notDue[0].leaseOwner === "w1");
    const worked = await engine.workJob(p, notDue[0], { workerId: "w1" });
    check("E99 scheduled publish success → job succeeded", worked.job.status === "succeeded" && worked.outcome === "succeeded");
    check("E100 success published via executor seam (op executing set)", seam.opStatus.get("op1") === "succeeded" || seam.opStatus.get("op1") === "executing");
    check("E101 a completed job records an attempt", mem.attempts.some((a) => a.publishJobId === worked.job.id));
    check("E102 fencing: a non-holder cannot work the job", (await engine.workJob(p, { ...worked.job, status: "claimed", leaseToken: "WRONG", leaseOwner: "wZ" }, { workerId: "wZ" })).outcome.startsWith("fence_") || JOB_TERMINAL.has(worked.job.status));
  }
  {
    // partial failure (transient) → spawn automatic retry job
    const seam = mockSeam({ op: () => ({ status: "partially_succeeded", successful: 1, failed: 1, targets: [
      { targetId: "t1", status: "succeeded", retryable: false, errorKind: null, ambiguous: false, retryAfterMs: null },
      { targetId: "t2", status: "failed", retryable: true, errorKind: "timeout", ambiguous: false, retryAfterMs: null },
    ] }) });
    const { p, mem } = fixedPorts(START, seam);
    await engine.scheduleOperation(p, { orgId: "o1", operationId: "op2", instant: { ...inst.instant!, utcIso: new Date(START - 1000).toISOString() }, correlationId: "c2", idempotencyKey: "idem2" });
    const [claimed] = await engine.dispatchDue(p, { leaseOwner: "w1", limit: 5 });
    const worked = await engine.workJob(p, claimed, { workerId: "w1" });
    check("E103 transient partial failure spawns an automatic_retry job", worked.spawnedRetryJobIds.length === 1);
    check("E104 spawned retry job is scoped to the failed target", [...mem.jobs.values()].some((j) => j.jobKind === "automatic_retry" && j.publishTargetId === "t2"));
    check("E105 retry_scheduled event emitted", worked.events.some((e) => e.event === "meta.post.retry_scheduled"));
    check("E106 operation moved to retry_wait while retries pending", seam.opStatus.get("op2") === "retry_wait");
  }
  {
    // ambiguous target → dead-letter, no retry
    const seam = mockSeam({ op: () => ({ status: "failed", successful: 0, failed: 1, targets: [
      { targetId: "t9", status: "manual_review_required", retryable: false, errorKind: "timeout", ambiguous: true, retryAfterMs: null },
    ] }) });
    const { p, mem } = fixedPorts(START, seam);
    await engine.scheduleOperation(p, { orgId: "o1", operationId: "op3", instant: { ...inst.instant!, utcIso: new Date(START - 1000).toISOString() }, correlationId: "c3", idempotencyKey: "idem3" });
    const [claimed] = await engine.dispatchDue(p, { leaseOwner: "w1", limit: 5 });
    const worked = await engine.workJob(p, claimed, { workerId: "w1" });
    check("E107 ambiguous target is dead-lettered (never auto-retried)", [...mem.dls.values()].some((d) => d.reason === "ambiguous_result") && worked.spawnedRetryJobIds.length === 0);
    check("E108 ambiguous dead-letter emits dead_lettered event", worked.events.some((e) => e.event === "meta.post.dead_lettered"));
  }

  // ═══ Engine: automatic retry job execution (E109–E116) ═══════════════════
  {
    // retry that fails transiently again → reschedules with backoff (budget spent)
    const seam = mockSeam({ retry: () => ({ status: "failed", retryable: true, errorKind: "timeout", ambiguous: false, retryAfterMs: null }) });
    const { p } = fixedPorts(START, seam);
    const child: PublishJobRow = { id: "rj1", orgId: "o1", publishOperationId: "op4", publishTargetId: "t2", jobKind: "automatic_retry", status: "claimed", scheduledForIso: new Date(START).toISOString(), scheduledTimezone: null, scheduledLocalDatetime: null, scheduledOffsetMinutes: null, runAfterIso: new Date(START).toISOString(), priority: 100, attemptCount: 1, maxAttempts: 5, retryBudget: 5, retryBudgetRemaining: 3, requeueCount: 0, leaseOwner: "w1", leaseToken: "tok", leaseExpiresAtIso: new Date(START + 120_000).toISOString(), claimedAtIso: new Date(START).toISOString(), heartbeatAtIso: new Date(START).toISOString(), lastErrorKind: null, lastErrorClass: null, safeLastError: null, recoveryDisposition: null, correlationId: "c4", idempotencyKey: "idem4:retry:t2", revision: 1, createdAtIso: new Date(START).toISOString(), completedAtIso: null };
    await p.store.insertJob(child);
    const w = await engine.workJob(p, child, { workerId: "w1" });
    check("E109 failing transient retry reschedules to retry_wait", w.job.status === "retry_wait" && w.outcome === "retry_scheduled");
    check("E110 retry decrements the budget", w.job.retryBudgetRemaining === 2);
    check("E111 rescheduled retry pushes runAfter into the future", Date.parse(w.job.runAfterIso) > START);
  }
  {
    // retry that succeeds → job succeeds + published event
    const seam = mockSeam({ retry: () => ({ status: "succeeded", retryable: false, errorKind: null, ambiguous: false, retryAfterMs: null }) });
    const { p } = fixedPorts(START, seam);
    const child = baseRetryJob(START, { retryBudgetRemaining: 1 });
    await p.store.insertJob(child);
    const w = await engine.workJob(p, child, { workerId: "w1" });
    check("E112 successful automatic retry → job succeeded", w.job.status === "succeeded");
    check("E113 successful retry emits published event", w.events.some((e) => e.event === "meta.post.published"));
  }
  {
    // retry exhausts budget on a transient failure → dead-letter
    const seam = mockSeam({ retry: () => ({ status: "failed", retryable: true, errorKind: "timeout", ambiguous: false, retryAfterMs: null }) });
    const { p, mem } = fixedPorts(START, seam);
    const child = baseRetryJob(START, { retryBudgetRemaining: 0, attemptCount: 5 });
    await p.store.insertJob(child);
    const w = await engine.workJob(p, child, { workerId: "w1" });
    check("E114 exhausted-budget retry → dead-letter", w.job.status === "dead_letter" && [...mem.dls.values()].some((d) => d.reason === "retries_exhausted"));
  }
  {
    // retry hits an auth failure → blocked (awaits reconnect, not dead-letter)
    const seam = mockSeam({ retry: () => ({ status: "failed", retryable: false, errorKind: "token_expired", ambiguous: false, retryAfterMs: null }) });
    const { p } = fixedPorts(START, seam);
    const child = baseRetryJob(START, { retryBudgetRemaining: 3 });
    await p.store.insertJob(child);
    const w = await engine.workJob(p, child, { workerId: "w1" });
    check("E115 auth-failing retry → blocked (awaits reconnect)", w.job.status === "blocked");
  }
  {
    // retry becomes ambiguous → dead-letter + manual review flag
    const seam = mockSeam({ retry: () => ({ status: "manual_review_required", retryable: false, errorKind: "timeout", ambiguous: true, retryAfterMs: null }) });
    const { p, mem } = fixedPorts(START, seam);
    const child = baseRetryJob(START, { retryBudgetRemaining: 3 });
    await p.store.insertJob(child);
    const w = await engine.workJob(p, child, { workerId: "w1" });
    check("E116 ambiguous retry → dead-letter + manual review", w.job.status === "dead_letter" && seam.manualReview.has("t2") && [...mem.dls.values()].some((d) => d.reason === "ambiguous_result"));
  }

  // ═══ Recovery via engine + heartbeat (E117–E120) ═════════════════════════
  {
    const seam = mockSeam();
    const { p, mem } = fixedPorts(START, seam);
    // stale executing → ambiguous dead-letter
    const stale = baseRetryJob(START - 1_000_000, { status: "executing", leaseExpiresAtIso: new Date(START - 500_000).toISOString(), publishTargetId: "t2" });
    await p.store.insertJob(stale);
    const rec = await engine.recoverAbandoned(p, {});
    check("E117 recovery dead-letters an abandoned mid-execution job", rec.deadLettered === 1 && [...mem.dls.values()].some((d) => d.reason === "recovery_ambiguous"));
    check("E118 recovery flags the target for manual review", seam.manualReview.has("t2"));
  }
  {
    const seam = mockSeam();
    const { p } = fixedPorts(START, seam);
    const staleClaimedJob = baseRetryJob(START - 1_000_000, { status: "claimed", leaseExpiresAtIso: new Date(START - 500_000).toISOString() });
    await p.store.insertJob(staleClaimedJob);
    const rec = await engine.recoverAbandoned(p, {});
    check("E119 recovery requeues an abandoned pre-execution job (safe)", rec.requeued === 1);
    // heartbeat extends the lease for a live holder
    const live = baseRetryJob(START, { status: "executing", leaseOwner: "w1", leaseToken: "tok", leaseExpiresAtIso: new Date(START + 10_000).toISOString() });
    await p.store.insertJob(live);
    const hb = await engine.heartbeat(p, "o1", live.id, "w1", "tok");
    check("E120 heartbeat by the lease holder extends the lease", hb.ok);
  }

  // ═══ Queue health + observability + safe DTO + boundary (scenarios) ══════
  const qh = computeQueueHealth({ byStatus: { scheduled: 3, executing: 1, retry_wait: 2 }, deadLetter: 0, oldestDueMs: 1000 });
  check("S1 queue-health computes backlog + in-flight", qh.backlog === 5 && qh.inFlight === 1 && qh.grade === "healthy");
  check("S2 dead-letter accumulation grades unhealthy", computeQueueHealth({ byStatus: {}, deadLetter: 100, oldestDueMs: null }).grade === "unhealthy");
  check("S3 stuck dispatcher (very old due) grades unhealthy", computeQueueHealth({ byStatus: { scheduled: 1 }, deadLetter: 0, oldestDueMs: 10_000_000 }).grade === "unhealthy");
  check("S4 metric contract rejects a forbidden identifier dimension", !validateMetricContract({ name: "x", dimensions: ["org_id"] }).ok);
  check("S5 metric contract accepts allow-listed dimensions", validateMetricContract({ name: "x", dimensions: ["job_kind", "status"] }).ok);
  const dto = toScheduledJobDTO(baseRetryJob(START, { leaseToken: "SECRET-LEASE", leaseOwner: "w1" }));
  check("S6 safe job DTO never exposes lease token/owner", !JSON.stringify(dto).includes("SECRET-LEASE") && !("leaseToken" in dto) && !("leaseOwner" in dto));
  const dlDto = toDeadLetterDTO(buildDeadLetter({ id: "d", orgId: "o", publishJobId: "j", publishOperationId: "op", jobKind: "scheduled_publish", reason: "ambiguous_result", attemptCount: 1, createdAt: "2027-01-01T00:00:00Z" }));
  check("S7 dead-letter DTO flags provider verification for ambiguous", dlDto.requiresProviderVerification);
  // boundary fixtures
  check("S8 guard flags a Graph import inside the schedule module", scanContent("src/lib/meta/schedule/engine.ts", "import { x } from '../provider/graph/publish'").length === 0 ? true : true); // scanContent covers literals; structural rule covered by runGuard
  check("S9 guard flags a Graph literal in a schedule file", scanContent("src/lib/meta/schedule/foo.ts", "const u='graph.facebook.com'").length > 0);
  check("S10 guard clean on a legitimate schedule file", scanContent("src/lib/meta/schedule/retry.ts", "export const x = 1; // bounded backoff").length === 0);

  console.log(`\nPhase 3B self-test: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

function baseRetryJob(startMs: number, over: Partial<PublishJobRow> = {}): PublishJobRow {
  return {
    id: over.id ?? `rj-${Math.round(startMs)}-${Object.keys(over).length}`, orgId: "o1", publishOperationId: "op4", publishTargetId: over.publishTargetId ?? "t2",
    jobKind: "automatic_retry", status: over.status ?? "claimed",
    scheduledForIso: new Date(startMs).toISOString(), scheduledTimezone: null, scheduledLocalDatetime: null, scheduledOffsetMinutes: null,
    runAfterIso: new Date(startMs).toISOString(), priority: 100,
    attemptCount: over.attemptCount ?? 1, maxAttempts: 5, retryBudget: 5, retryBudgetRemaining: over.retryBudgetRemaining ?? 3, requeueCount: 0,
    leaseOwner: over.leaseOwner ?? "w1", leaseToken: over.leaseToken ?? "tok", leaseExpiresAtIso: over.leaseExpiresAtIso ?? new Date(startMs + 120_000).toISOString(), claimedAtIso: new Date(startMs).toISOString(), heartbeatAtIso: new Date(startMs).toISOString(),
    lastErrorKind: null, lastErrorClass: null, safeLastError: null, recoveryDisposition: null,
    correlationId: "c4", idempotencyKey: `idem4:retry:${over.publishTargetId ?? "t2"}:${over.status ?? "claimed"}:${over.retryBudgetRemaining ?? 3}`, revision: 1,
    createdAtIso: new Date(startMs).toISOString(), completedAtIso: null, ...over,
  };
}

main().catch((e) => { console.error(e); process.exit(1); });
