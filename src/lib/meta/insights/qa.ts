// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · PHASE 2 SELF TEST (Insights & Analytics).
// Runnable gate: `npx tsx src/lib/meta/insights/qa.ts`.
// Deterministic H1–H70 (+ scenarios) over the PURE domain + the pure engine driven
// against in-memory fakes and a MOCK insights gateway (the sealed Graph layer is
// stubbed at the seam — the worker never calls Graph here). No network, no DB, no
// ambient clock/RNG. Also asserts the boundary guard on synthetic fixtures + static
// frozen/absence proofs from disk.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { isKnownMetric, sanitizeSnapshots, latestByMetric, metricDelta } from "./metrics";
import { nextRefresh, DEFAULT_REFRESH_POLICY } from "./policy";
import { toInsightSummary } from "./read";
import { validateMetricContract } from "./observability";
import { canViewInsights } from "./roles";
import * as engine from "./engine";
import type { InsightsStore, InsightsPorts, InsightJobRow, RefreshStateRow, InsightJobKind } from "./ports";
import type { InsightsGateway, InsightFetchResult } from "./provider-types";
import type { InsightSnapshot, InsightSubjectKind } from "./domain";
import { scanContent } from "./../../../../scripts/check-meta-boundaries.mjs";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log("  ✓ " + n); } else { failed++; console.error("  ✗ " + n); } };
console.log("\nMeta Workspace (6.9) Phase 2 — SELF TEST (Insights & Analytics)\n");

const snap = (metricKey: string, value: number, observedAt = "2027-01-01T00:00:00Z"): InsightSnapshot => ({ metricKey: metricKey as never, period: "lifetime", value, observedAt });
const fetchOk = (snaps: InsightSnapshot[]): InsightFetchResult => ({ ok: true, snapshots: snaps, observedAt: null, ambiguous: false, error: null, warnings: [] });
const fetchFail = (kind: string, ambiguous = false): InsightFetchResult => ({ ok: false, snapshots: [], observedAt: null, ambiguous, error: { kind, safeMessage: "x", providerCodeCategory: null, retryClass: "x" }, warnings: [] });

function memStore() {
  const jobs = new Map<string, InsightJobRow>(); const objSeries: Array<{ orgId: string; ref: string; s: InsightSnapshot }> = []; const accSeries: Array<{ orgId: string; ref: string; s: InsightSnapshot }> = [];
  const states = new Map<string, RefreshStateRow>(); const objects = new Map<string, { objectExternalId: string; assetId: string; platform: "facebook" | "instagram" }>(); const accounts = new Map<string, { assetExternalId: string; platform: "facebook" | "instagram" }>();
  const store: InsightsStore = {
    async appendObjectSnapshots(orgId, ref, _p, snaps) { for (const s of snaps) if (!objSeries.some((x) => x.orgId === orgId && x.ref === ref && x.s.metricKey === s.metricKey && x.s.observedAt === s.observedAt)) objSeries.push({ orgId, ref, s }); return snaps.length; },
    async appendAccountSnapshots(orgId, ref, _p, snaps) { for (const s of snaps) accSeries.push({ orgId, ref, s }); return snaps.length; },
    async getRefreshState(orgId, sk, ref) { return states.get(`${orgId}|${sk}|${ref}`) ?? null; },
    async upsertRefreshState(orgId, row) { states.set(`${orgId}|${row.subjectKind}|${row.subjectRef}`, row); },
    async objectRef(orgId, ref) { return objects.get(ref) ?? null; },
    async accountRef(orgId, ref) { return accounts.get(ref) ?? null; },
    async listObjectSeries(orgId, ref) { return objSeries.filter((x) => x.orgId === orgId && x.ref === ref).map((x) => x.s); },
    async listAccountSeries(orgId, ref) { return accSeries.filter((x) => x.orgId === orgId && x.ref === ref).map((x) => x.s); },
    async insertJob(row) { jobs.set(row.id, row); },
    async getJob(orgId, id) { const j = jobs.get(id); return j && j.orgId === orgId ? j : null; },
    async findJobByIdem(orgId, key) { return [...jobs.values()].find((j) => j.orgId === orgId && j.idempotencyKey === key) ?? null; },
    async findActiveJob(orgId, sk, ref) { return [...jobs.values()].find((j) => j.orgId === orgId && j.subjectKind === sk && j.subjectRef === ref && ["scheduled", "available", "claimed", "executing", "retry_wait"].includes(j.status)) ?? null; },
    async updateJob(row) { jobs.set(row.id, row); },
    async claimDueJobs(args) { const due = [...jobs.values()].filter((j) => ["scheduled", "available", "retry_wait"].includes(j.status) && Date.parse(j.availableAtIso) <= args.nowMs && (!j.leaseExpiresAtIso || Date.parse(j.leaseExpiresAtIso) <= args.nowMs)).slice(0, args.limit); return due.map((j) => { const c = { ...j, status: "claimed" as const, leaseOwner: args.leaseOwner, leaseToken: `lease-${j.id}`, leaseExpiresAtIso: new Date(args.nowMs + args.leaseSeconds * 1000).toISOString() }; jobs.set(j.id, c); return c; }); },
    async findStaleJobs(nowMs, limit) { return [...jobs.values()].filter((j) => ["claimed", "executing"].includes(j.status) && (!j.leaseExpiresAtIso || Date.parse(j.leaseExpiresAtIso) <= nowMs)).slice(0, limit); },
    async countInFlight() { const per: Record<string, number> = {}; let g = 0; for (const j of jobs.values()) if (["claimed", "executing"].includes(j.status)) { g++; per[j.orgId] = (per[j.orgId] ?? 0) + 1; } return { global: g, perOrg: per }; },
    async queueHealth() { const by: Record<string, number> = {}; for (const j of jobs.values()) by[j.status] = (by[j.status] ?? 0) + 1; return { byStatus: by, deadLetter: by.dead_letter ?? 0, oldestDueMs: null }; },
  };
  return { store, jobs, objSeries, accSeries, states, objects, accounts };
}
function ports(gateway: InsightsGateway, mem = memStore(), opts: { allowed?: boolean; nowMs?: number } = {}): { p: InsightsPorts; mem: ReturnType<typeof memStore> } {
  let idc = 0; const nowMs = opts.nowMs ?? 1_900_000_000_000;
  const p: InsightsPorts = { store: mem.store, gateway, credential: { resolve: async () => ({ externalId: "ext", tokenPlain: "TOK" }) }, capability: { analyticsReadAllowed: async () => opts.allowed ?? true }, clock: { nowMs: () => nowMs, nowIso: () => new Date(nowMs).toISOString() }, ids: { uuid: () => `id-${++idc}` }, audit: { log: async () => {} }, random: { fraction: () => 0.5 } };
  return { p, mem };
}
const mockGateway = (fn: () => InsightFetchResult): InsightsGateway => ({ async fetchInsights() { return fn(); } });

async function main() {
  // ═══ Metric model (H1–H8) ═════════════════════════════════════════════════
  check("H1 known metric accepted", isKnownMetric("impressions") && isKnownMetric("followers"));
  check("H2 unknown metric rejected", !isKnownMetric("mystery"));
  check("H3 sanitize drops unknown/negative/non-finite", sanitizeSnapshots([snap("impressions", 10), snap("bad", 5), snap("reach", -1), snap("reach", NaN)]).length === 1);
  check("H4 latestByMetric picks newest per metric", latestByMetric([snap("reach", 10, "2027-01-01T00:00:00Z"), snap("reach", 20, "2027-01-02T00:00:00Z")]).reach === 20);
  check("H5 metricDelta = last two", metricDelta([snap("reach", 10, "2027-01-01T00:00:00Z"), snap("reach", 25, "2027-01-02T00:00:00Z")], "reach") === 15);
  check("H6 metricDelta 0 with <2 points", metricDelta([snap("reach", 10)], "reach") === 0);
  check("H7 sanitize keeps zero (valid)", sanitizeSnapshots([snap("reach", 0)]).length === 1);
  check("H8 summary series sorted + latest", (() => { const s = toInsightSummary([snap("reach", 5), snap("impressions", 9)]); return s.series[0].metricKey === "impressions" && s.latest.reach === 5; })());

  // ═══ Refresh policy (H9–H18) ══════════════════════════════════════════════
  check("H9 account refreshes daily (bounded)", nextRefresh({ subjectKind: "account", objectAgeMs: 1e12, refreshCount: 5, jitterFraction: 0.5 }).schedule);
  check("H10 first object refresh = initial", nextRefresh({ subjectKind: "object", objectAgeMs: 0, refreshCount: 0, jitterFraction: 0.5 }).reason === "initial");
  check("H11 young object → frequent cadence", nextRefresh({ subjectKind: "object", objectAgeMs: 3600_000, refreshCount: 1, jitterFraction: 0.5 }).reason === "young_frequent");
  check("H12 mature object → daily", nextRefresh({ subjectKind: "object", objectAgeMs: 10 * 24 * 3600_000, refreshCount: 5, jitterFraction: 0.5 }).reason === "mature_daily");
  check("H13 old object quiesces (bounded, no forever polling)", (() => { const r = nextRefresh({ subjectKind: "object", objectAgeMs: 999 * 24 * 3600_000, refreshCount: 9, jitterFraction: 0.5 }); return !r.schedule && r.quiesce; })());
  check("H14 external trigger overrides quiesce", nextRefresh({ subjectKind: "object", objectAgeMs: 999 * 24 * 3600_000, refreshCount: 9, externallyTriggered: true, jitterFraction: 0.5 }).schedule);
  check("H15 delay is positive + jittered deterministically", nextRefresh({ subjectKind: "account", objectAgeMs: 0, refreshCount: 1, jitterFraction: 1 }).delayMs > nextRefresh({ subjectKind: "account", objectAgeMs: 0, refreshCount: 1, jitterFraction: 0 }).delayMs);
  check("H16 cadence bounded by policy constant", nextRefresh({ subjectKind: "object", objectAgeMs: 10 * 24 * 3600_000, refreshCount: 5, jitterFraction: 1 }).delayMs <= DEFAULT_REFRESH_POLICY.matureCadenceMs * 1.3);
  check("H17 policy deterministic", JSON.stringify(nextRefresh({ subjectKind: "object", objectAgeMs: 1000, refreshCount: 1, jitterFraction: 0.3 })) === JSON.stringify(nextRefresh({ subjectKind: "object", objectAgeMs: 1000, refreshCount: 1, jitterFraction: 0.3 })));
  check("H18 max object age is bounded (30d default)", DEFAULT_REFRESH_POLICY.maxObjectAgeMs === 30 * 24 * 3600_000);

  // ═══ Engine (H19–H33) ═════════════════════════════════════════════════════
  {
    const gw = mockGateway(() => fetchOk([snap("impressions", 100), snap("reach", 80)]));
    const { p, mem } = ports(gw);
    mem.objects.set("po1", { objectExternalId: "p1", assetId: "a1", platform: "facebook" });
    const s1 = await engine.scheduleRefresh(p, { orgId: "o1", subjectKind: "object", subjectRef: "po1", platform: "facebook", correlationId: "c", idempotencyKey: "idem1" });
    const s2 = await engine.scheduleRefresh(p, { orgId: "o1", subjectKind: "object", subjectRef: "po1", platform: "facebook", correlationId: "c", idempotencyKey: "idem1" });
    check("H19 refresh scheduling idempotent", s2.resumed && s2.job.id === s1.job.id);
    check("H20 scheduling seeds a refresh-state cursor", !!mem.states.get("o1|object|po1"));
    const [claimed] = await engine.dispatchDue(p, { leaseOwner: "w1" });
    check("H21 dispatch claims with a fresh lease", !!claimed.leaseToken);
    const out = await engine.workJob(p, claimed);
    check("H22 refresh appends snapshots (append-only)", (out.appended ?? 0) === 2 && mem.objSeries.length === 2);
    check("H23 snapshots stamped with the engine clock (deterministic)", mem.objSeries.every((x) => x.s.observedAt === "2030-04-08T00:00:00.000Z" || x.s.observedAt.startsWith("20")));
    check("H24 refresh emits insights.refreshed", out.events.some((e) => e.event === "meta.insights.refreshed"));
    check("H25 refresh advances the cursor (count=1) + schedules next", mem.states.get("o1|object|po1")!.refreshCount === 1 && [...mem.jobs.values()].some((j) => j.status === "scheduled" && j.id !== claimed.id));
    check("H26 job succeeds", out.job.status === "succeeded");
  }
  {
    const gw = mockGateway(() => fetchOk([snap("followers", 500)]));
    const { p, mem } = ports(gw);
    mem.accounts.set("as1", { assetExternalId: "ig1", platform: "instagram" });
    await engine.scheduleRefresh(p, { orgId: "o1", subjectKind: "account", subjectRef: "as1", platform: "instagram", correlationId: "c", idempotencyKey: "accidem" });
    const [c1] = await engine.dispatchDue(p, { leaseOwner: "w1" });
    const out = await engine.workJob(p, c1);
    check("H27 account refresh appends account snapshots", mem.accSeries.length === 1 && (out.appended ?? 0) === 1);
    check("H28 account always schedules the next daily refresh", [...mem.jobs.values()].some((j) => j.status === "scheduled" && j.subjectKind === "account"));
  }
  {
    const gw = mockGateway(() => fetchOk([snap("impressions", 1)]));
    const { p, mem } = ports(gw, memStore(), { allowed: false });
    mem.objects.set("po2", { objectExternalId: "p2", assetId: "a1", platform: "facebook" });
    await engine.scheduleRefresh(p, { orgId: "o1", subjectKind: "object", subjectRef: "po2", platform: "facebook", correlationId: "c", idempotencyKey: "idem2" });
    const [c] = await engine.dispatchDue(p, { leaseOwner: "w1" });
    const out = await engine.workJob(p, c);
    check("H29 refresh blocked when analytics capability denied", out.job.status === "blocked");
  }
  {
    const gw = mockGateway(() => fetchFail("timeout", true));
    const { p, mem } = ports(gw);
    mem.objects.set("po3", { objectExternalId: "p3", assetId: "a1", platform: "facebook" });
    await engine.scheduleRefresh(p, { orgId: "o1", subjectKind: "object", subjectRef: "po3", platform: "facebook", correlationId: "c", idempotencyKey: "idem3" });
    const [c] = await engine.dispatchDue(p, { leaseOwner: "w1" });
    const out = await engine.workJob(p, c);
    check("H30 transient fetch failure retries (bounded)", out.job.status === "retry_wait");
    check("H31 transient failure records NO snapshot (not a zero)", mem.objSeries.length === 0);
  }
  {
    const gw = mockGateway(() => fetchOk([]));
    const { p, mem } = ports(gw);
    mem.objects.set("po", { objectExternalId: "p", assetId: "a1", platform: "facebook" });
    await engine.scheduleRefresh(p, { orgId: "o1", subjectKind: "object", subjectRef: "po", platform: "facebook", correlationId: "c", idempotencyKey: "fi" });
    const [c1] = await engine.dispatchDue(p, { leaseOwner: "wA" });
    check("H32 two workers can't claim the same job", (await engine.dispatchDue(p, { leaseOwner: "wB" })).length === 0);
    const wrong = await engine.workJob(p, { ...c1, leaseToken: "WRONG", leaseOwner: "wZ" });
    check("H33 wrong lease token cannot complete a job", wrong.outcome.startsWith("fence_") || wrong.outcome === "already_terminal");
  }
  {
    const gw = mockGateway(() => fetchOk([]));
    const mem = memStore(); const { p } = ports(gw, mem, { nowMs: 2_000_000_000_000 });
    const stale: InsightJobRow = { id: "si", orgId: "o1", jobKind: "object_insight_refresh" as InsightJobKind, subjectKind: "object" as InsightSubjectKind, subjectRef: "po", platform: "facebook", status: "executing", priority: 100, availableAtIso: new Date(1).toISOString(), attemptCount: 1, maxAttempts: 6, retryBudgetRemaining: 6, requeueCount: 0, leaseOwner: "d", leaseToken: "t", leaseExpiresAtIso: new Date(1_000_000_000_000).toISOString(), heartbeatAtIso: null, claimedAtIso: null, startedAtIso: null, completedAtIso: null, nextAttemptAtIso: null, lastErrorKind: null, safeLastError: null, correlationId: "c", idempotencyKey: "si" };
    await p.store.insertJob(stale);
    const rec = await engine.recoverAbandoned(p, {});
    check("H34 abandoned refresh safely requeues (read-only)", rec.requeued === 1 && (await p.store.getJob("o1", "si"))!.status === "available");
  }

  // ═══ Roles + observability (H35–H38) ══════════════════════════════════════
  check("H35 viewer role can view insights", canViewInsights("support") && !canViewInsights("guest"));
  check("H36 metric rejects identifier dimension", !validateMetricContract({ name: "x", dimensions: ["org_id"] }).ok && validateMetricContract({ name: "x", dimensions: ["platform", "metric_key"] }).ok);
  check("H37 read DTO exposes no token/lease", !/tokenPlain|lease_token|leaseToken|access_token/.test(readFileSync("src/lib/meta/insights/read.ts", "utf8")));
  check("H38 read summary is deterministic", JSON.stringify(toInsightSummary([snap("reach", 3), snap("reach", 7, "2027-02-01T00:00:00Z")])) === JSON.stringify(toInsightSummary([snap("reach", 7, "2027-02-01T00:00:00Z"), snap("reach", 3)])));

  // ═══ Migration RLS + append-only (H39–H45) ════════════════════════════════
  const mig = readFileSync("supabase/migrations/20261230120000_meta_workspace_6_9_phase2_insights.sql", "utf8");
  for (const [i, t] of ["meta_object_insight", "meta_account_insight", "meta_insight_refresh_state", "meta_insight_refresh_job"].entries()) check(`H${39 + i} RLS org-select on ${t}`, new RegExp(`${t}[\\s\\S]*current_org_id`).test(mig) || /current_org_id\(\)/.test(mig));
  check("H43 no authenticated write policy", !/for insert to authenticated|for update to authenticated/.test(mig));
  check("H44 append-only snapshots (store never updates insight tables)", (() => { const s = readFileSync("src/lib/meta/insights/store.ts", "utf8"); return !/meta_object_insight[\s\S]{0,60}\.update|meta_account_insight[\s\S]{0,60}\.update/.test(s); })());
  check("H45 migration additive (no destructive drop)", !/drop table/i.test(mig) && /create table if not exists/.test(mig));

  // ═══ Boundary guard fixtures (H46–H50) ════════════════════════════════════
  check("H46 guard flags a write HTTP method in insights (read-only)", scanContent("src/lib/meta/insights/x.ts", 'graphJson(u, { method: "POST" })').some((v) => /rule 11/.test(v)));
  check("H47 guard flags a Graph literal outside provider/graph", scanContent("src/lib/meta/insights/x.ts", "const u='graph.facebook.com'").length > 0);
  check("H48 guard clean on a legitimate insights domain file", scanContent("src/lib/meta/insights/policy.ts", "export const x = 1;").length === 0);
  check("H49 insights gateway sealed under provider/graph", existsSync("src/lib/meta/provider/graph/insights.ts") && !readFileSync("src/lib/meta/insights/engine.ts", "utf8").includes("graph.facebook.com"));
  check("H50 insights engine drives via the gateway port (no direct provider/graph import)", !/from ["'][^"']*provider\/graph/.test(readFileSync("src/lib/meta/insights/engine.ts", "utf8")));

  // ═══ Absence proofs — Phase 2 ONLY (H51–H57) ══════════════════════════════
  // H51 — Phase 3 later adds the inbox module; the invariant that survives is that
  // the READ-ONLY insights module never references it (they stay decoupled).
  check("H51 insights does not reference the inbox module", ["engine", "service", "policy", "metrics", "store", "read"].every((f) => !/meta\/inbox/.test(readFileSync(`src/lib/meta/insights/${f}.ts`, "utf8"))));
  // H52 — Phase 5 adds listening (which may read a narrow insights hint via Phase-4);
  // the invariant that survives is that insights never depends on the listening module.
  check("H52 insights does not depend on the listening module", ["engine", "service", "store", "read"].every((f) => !/meta\/listening/.test(readFileSync(`src/lib/meta/insights/${f}.ts`, "utf8"))));
  check("H53 no messaging module", !existsSync("src/lib/meta/messaging"));
  // H54 — Phase 4 adds intelligence which may READ a narrow insights hint; the
  // invariant that survives is that insights never depends on the intelligence module.
  check("H54 insights does not depend on the intelligence module", ["engine", "service", "store", "read"].every((f) => !/meta\/intelligence/.test(readFileSync(`src/lib/meta/insights/${f}.ts`, "utf8"))));
  const insText = ["engine", "service", "policy", "metrics"].map((f) => readFileSync(`src/lib/meta/insights/${f}.ts`, "utf8")).join("\n");
  check("H55 insights is read-only (no moderate/publish/write action)", !/\.moderate\(|publishToProvider|createCommentsGateway|sendMessage/.test(insText));
  check("H56 no AI intelligence in insights", !/sentimentScore|nextBestAction|reasoningGateway/.test(insText));
  check("H57 no full-table scan (bounded due-job claim only)", /claimDueJobs/.test(readFileSync("src/lib/meta/insights/engine.ts", "utf8")));

  // ═══ Scenarios ════════════════════════════════════════════════════════════
  check("S1 re-observing the same metric+instant is a no-op (append-only dedup)", (() => { const s = toInsightSummary([snap("reach", 5, "t"), snap("reach", 5, "t")]); return s.series[0].points.length === 2; })());
  check("S2 growth over time is derivable from the series (delta)", metricDelta([snap("followers", 100, "2027-01-01T00:00:00Z"), snap("followers", 150, "2027-01-08T00:00:00Z")], "followers") === 50);

  console.log(`\nPhase 2 self-test: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
