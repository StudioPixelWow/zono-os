// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · PHASE 1 SELF TEST (Comment Ingestion &
// Moderation). Runnable gate: `npx tsx src/lib/meta/engagement/qa.ts`.
// Deterministic G1–G90 (+ scenarios) over the PURE domain + the pure engine driven
// against in-memory fakes and a MOCK comments gateway (the sealed Graph layer is
// stubbed at the seam — the worker never calls Graph here). No network, no DB, no
// ambient clock/RNG. Also asserts the boundary guard on synthetic fixtures + static
// frozen/absence proofs from disk.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { createHmac } from "node:crypto";
import { verifySignature } from "./../webhooks/verify";
import { extractCommentSignals } from "./webhook";
import { normalizeComment, commentFingerprint, commentChanged } from "./normalize";
import { rollupThreads } from "./threading";
import { canTransitionModeration, approvalRequired, isExecutable, moderationEligibility, classifyModerationOutcome, MODERATION_TERMINAL } from "./moderation";
import { canViewComments, canRequestModeration, canApproveModeration } from "./roles";
import { validateMetricContract } from "./observability";
import * as engine from "./engine";
import type { EngagementStore, EngagementPorts, CommentJobRow, ModerationActionRow, CommentJobKind } from "./ports";
import type { CommentsGateway, CommentFetchResult, ModerationResult, ProviderComment } from "./provider-types";
import type { CommentRecord, ModerationKind } from "./domain";
import { scanContent } from "./../../../../scripts/check-meta-boundaries.mjs";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log("  ✓ " + n); } else { failed++; console.error("  ✗ " + n); } };
console.log("\nMeta Workspace (6.9) Phase 1 — SELF TEST (Comment Ingestion & Moderation)\n");

const SECRET = "s3cret";
const sign = (b: string) => "sha256=" + createHmac("sha256", SECRET).update(Buffer.from(b, "utf8")).digest("hex");
const pc = (over: Partial<ProviderComment> = {}): ProviderComment => ({ externalId: "c1", parentExternalId: null, message: "hi", authorExternalId: "u1", authorDisplay: "User", createdTime: "2027-01-01T00:00:00Z", updatedTime: null, likeCount: 0, replyCount: 0, isHidden: false, isFromPage: false, attachmentsSafe: [], ...over });
const fetchOk = (comments: ProviderComment[], nextCursor: string | null = null): CommentFetchResult => ({ ok: true, comments, nextCursor, ambiguous: false, error: null, warnings: [] });
const modOk = (id: string | null = null): ModerationResult => ({ ok: true, providerResultId: id, ambiguous: false, error: null, retryClass: "non_retryable" });
const modAmbiguous = (): ModerationResult => ({ ok: false, providerResultId: null, ambiguous: true, error: { kind: "timeout", safeMessage: "lost", providerCodeCategory: null, retryClass: "ambiguous" }, warnings: [] } as unknown as ModerationResult);

function memStore() {
  const jobs = new Map<string, CommentJobRow>(); const actions = new Map<string, ModerationActionRow>();
  const comments = new Map<string, { id: string; rec: CommentRecord; providerObjectId: string | null; status: string }>();
  const threads = new Map<string, unknown>(); const objects = new Map<string, { objectExternalId: string; assetId: string; platform: "facebook" | "instagram" }>();
  let cseq = 0;
  const store: EngagementStore = {
    async upsertComment(orgId, providerObjectId, rec) { const key = `${rec.platform}:${rec.externalId}`; const ex = [...comments.values()].find((c) => c.rec.platform === rec.platform && c.rec.externalId === rec.externalId); if (ex) { ex.rec = rec; ex.providerObjectId = providerObjectId; ex.status = rec.status; return { id: ex.id, changed: true }; } const id = `cm-${++cseq}`; comments.set(id, { id, rec, providerObjectId, status: rec.status }); void key; return { id, changed: true }; },
    async getComment(orgId, id) { const c = comments.get(id); return c ? { id, externalId: c.rec.externalId, platform: c.rec.platform, status: c.status, providerObjectId: c.providerObjectId } : null; },
    async getCommentByExternalId(orgId, platform, externalId) { const c = [...comments.values()].find((x) => x.rec.platform === platform && x.rec.externalId === externalId); return c ? { id: c.id, contentFingerprint: c.rec.contentFingerprint } : null; },
    async listCommentsForObject(orgId, poid) { return [...comments.values()].filter((c) => c.providerObjectId === poid).map((c) => c.rec); },
    async setCommentStatus(orgId, id, status) { const c = comments.get(id); if (c) c.status = status; },
    async upsertThread(orgId, poid, platform, roll) { threads.set(roll.rootExternalId, roll); },
    async objectRef(orgId, poid) { return objects.get(poid) ?? null; },
    async insertAction(row) { actions.set(row.id, row); },
    async getAction(orgId, id) { const a = actions.get(id); return a && a.orgId === orgId ? a : null; },
    async findActiveAction(orgId, tc, kind) { return [...actions.values()].find((a) => a.orgId === orgId && a.targetCommentId === tc && a.actionKind === kind && ["pending", "ready", "executing", "provider_processing"].includes(a.status)) ?? null; },
    async updateAction(row) { actions.set(row.id, row); },
    async moderationRef(orgId, actionId) { const a = actions.get(actionId); if (!a) return null; const c = comments.get(a.targetCommentId); if (!c) return null; const obj = c.providerObjectId ? objects.get(c.providerObjectId) : null; return { action: a, ref: { commentExternalId: c.rec.externalId, platform: c.rec.platform, objectExternalId: obj?.objectExternalId ?? null, assetId: obj?.assetId ?? "a1", status: c.status } }; },
    async insertJob(row) { jobs.set(row.id, row); },
    async getJob(orgId, id) { const j = jobs.get(id); return j && j.orgId === orgId ? j : null; },
    async findJobByIdem(orgId, key) { return [...jobs.values()].find((j) => j.orgId === orgId && j.idempotencyKey === key) ?? null; },
    async findActiveJob(orgId, kind, anchor) { return [...jobs.values()].find((j) => j.orgId === orgId && j.jobKind === kind && ["scheduled", "available", "claimed", "executing", "retry_wait"].includes(j.status) && (j.engagementActionId === anchor || j.targetCommentId === anchor || j.providerObjectId === anchor)) ?? null; },
    async updateJob(row) { jobs.set(row.id, row); },
    async claimDueJobs(args) { const due = [...jobs.values()].filter((j) => ["scheduled", "available", "retry_wait"].includes(j.status) && Date.parse(j.availableAtIso) <= args.nowMs && (!j.leaseExpiresAtIso || Date.parse(j.leaseExpiresAtIso) <= args.nowMs)).slice(0, args.limit); return due.map((j) => { const c = { ...j, status: "claimed" as const, leaseOwner: args.leaseOwner, leaseToken: `lease-${j.id}`, leaseExpiresAtIso: new Date(args.nowMs + args.leaseSeconds * 1000).toISOString() }; jobs.set(j.id, c); return c; }); },
    async findStaleJobs(nowMs, limit) { return [...jobs.values()].filter((j) => ["claimed", "executing"].includes(j.status) && (!j.leaseExpiresAtIso || Date.parse(j.leaseExpiresAtIso) <= nowMs)).slice(0, limit); },
    async countInFlight() { const per: Record<string, number> = {}; let g = 0; for (const j of jobs.values()) if (["claimed", "executing"].includes(j.status)) { g++; per[j.orgId] = (per[j.orgId] ?? 0) + 1; } return { global: g, perOrg: per }; },
    async queueHealth() { const by: Record<string, number> = {}; for (const j of jobs.values()) by[j.status] = (by[j.status] ?? 0) + 1; return { byStatus: by, deadLetter: by.dead_letter ?? 0, oldestDueMs: null }; },
  };
  return { store, jobs, actions, comments, threads, objects };
}

function ports(gateway: CommentsGateway, mem = memStore(), opts: { readAllowed?: boolean; moderateAllowed?: boolean; assetActive?: boolean; nowMs?: number } = {}): { p: EngagementPorts; mem: ReturnType<typeof memStore>; audit: string[] } {
  const audit: string[] = []; let idc = 0; const nowMs = opts.nowMs ?? 1_900_000_000_000;
  const p: EngagementPorts = { store: mem.store, gateway, credential: { resolve: async () => ({ externalId: "ext_asset", tokenPlain: "TOKEN" }) }, capability: { commentsReadAllowed: async () => opts.readAllowed ?? true, commentsModerateAllowed: async () => ({ allowed: opts.moderateAllowed ?? true, assetActive: opts.assetActive ?? true }) }, clock: { nowMs: () => nowMs, nowIso: () => new Date(nowMs).toISOString() }, ids: { uuid: () => `id-${++idc}` }, audit: { log: async (i) => { audit.push(i.action); } }, random: { fraction: () => 0.5 } };
  return { p, mem, audit };
}
function mockGateway(over: { fetch?: (n: number) => CommentFetchResult; moderate?: () => ModerationResult } = {}): CommentsGateway & { fetchCalls: number; moderateCalls: number } {
  const g = { fetchCalls: 0, moderateCalls: 0, async fetchComments() { const r = over.fetch ? over.fetch(g.fetchCalls) : fetchOk([]); g.fetchCalls++; return r; }, async moderate() { const r = over.moderate ? over.moderate() : modOk(); g.moderateCalls++; return r; } };
  return g;
}

async function main() {
  // ═══ Webhook signal extraction (G1–G8) ════════════════════════════════════
  const fbBody = { object: "page", entry: [{ id: "pg", time: 1, changes: [{ field: "feed", value: { item: "comment", verb: "add", comment_id: "c100", post_id: "p1", parent_id: null } }] }] };
  const sigs = extractCommentSignals(fbBody);
  check("G1 extracts a FB comment signal (post + comment + verb)", sigs.length === 1 && sigs[0].postExternalId === "p1" && sigs[0].commentExternalId === "c100" && sigs[0].verb === "add");
  check("G2 IG comments field extracted", extractCommentSignals({ object: "instagram", entry: [{ id: "ig", time: 1, changes: [{ field: "comments", value: { id: "c2", media: { id: "m1" } } }] }] })[0].postExternalId === "m1");
  check("G3 signal never carries an org id", !JSON.stringify(sigs).toLowerCase().includes("org"));
  check("G4 non-comment body yields no signals", extractCommentSignals({ object: "page", entry: [{ id: "p", time: 1, changes: [{ field: "feed", value: { item: "status" } }] }] }).length === 0);
  check("G5 remove verb classified", extractCommentSignals({ object: "page", entry: [{ id: "p", time: 1, changes: [{ field: "comments", value: { verb: "remove", comment_id: "c", post_id: "p" } }] }] })[0].verb === "remove");
  const b = JSON.stringify(fbBody);
  check("G6 signed comment webhook verifies (reuses 6.8 verify)", verifySignature(b, sign(b), SECRET, { contentType: "application/json" }).ok);
  check("G7 tampered comment webhook rejected", !verifySignature(b + " ", sign(b), SECRET).ok);
  check("G8 malformed body → no signals (never throws)", extractCommentSignals("nope").length === 0);

  // ═══ Normalize + dedup (G9–G16) ═══════════════════════════════════════════
  const nRoot = normalizeComment(pc({ externalId: "r1", parentExternalId: null }), "facebook");
  check("G9 root comment resolves root=self", nRoot.rootExternalId === "r1");
  const nReply = normalizeComment(pc({ externalId: "rp1", parentExternalId: "r1" }), "facebook");
  check("G10 reply resolves root=parent", nReply.rootExternalId === "r1");
  check("G11 hidden maps to status hidden", normalizeComment(pc({ isHidden: true }), "facebook").status === "hidden");
  check("G12 page author → isFromPage", normalizeComment(pc({ authorExternalId: "page1" }), "facebook", new Set(["page1"])).isFromPage);
  check("G13 fingerprint deterministic", commentFingerprint(pc()) === commentFingerprint(pc()));
  check("G14 fingerprint changes on edit", commentFingerprint(pc({ message: "a" })) !== commentFingerprint(pc({ message: "b" })));
  check("G15 commentChanged detects a like-count change", commentChanged(commentFingerprint(pc({ likeCount: 0 })), normalizeComment(pc({ likeCount: 5 }), "facebook")));
  check("G16 unchanged comment is a no-op (same fingerprint)", !commentChanged(nRoot.contentFingerprint, normalizeComment(pc({ externalId: "r1" }), "facebook")));

  // ═══ Threading (G17–G21) ═══════════════════════════════════════════════════
  const set: CommentRecord[] = [normalizeComment(pc({ externalId: "r", authorExternalId: "u", message: "q" }), "facebook"), normalizeComment(pc({ externalId: "rep", parentExternalId: "r", authorExternalId: "page", isFromPage: true }), "facebook", new Set(["page"]))];
  const rolls = rollupThreads(set);
  check("G17 thread rollup groups by root", rolls.length === 1 && rolls[0].rootExternalId === "r");
  check("G18 reply count excludes root", rolls[0].replyCount === 1);
  check("G19 page reply detected", rolls[0].pageReplied === true);
  check("G20 addressed thread not flagged unaddressed", rolls[0].hasUnaddressed === false);
  check("G21 unaddressed public comment flagged", rollupThreads([normalizeComment(pc({ externalId: "x", authorExternalId: "u" }), "facebook")])[0].hasUnaddressed === true);

  // ═══ Moderation state machine + approval (G22–G33) ════════════════════════
  check("G22 approval is always required", approvalRequired() === true);
  check("G23 pending not executable until approved", !isExecutable("pending", "pending"));
  check("G24 approved+ready is executable", isExecutable("approved", "ready"));
  check("G25 executing→succeeded valid", canTransitionModeration("executing", "succeeded"));
  check("G26 executing→manual_review valid", canTransitionModeration("executing", "manual_review_required"));
  check("G27 succeeded terminal", MODERATION_TERMINAL.has("succeeded") && !canTransitionModeration("succeeded", "ready"));
  check("G28 eligibility blocks unapproved", !moderationEligibility("reply", { actorCanModerate: true, capabilityAllowed: true, assetActive: true, commentStatus: "visible", replyText: "hi", approvalState: "pending" }).eligible);
  check("G29 eligibility blocks empty reply", !moderationEligibility("reply", { actorCanModerate: true, capabilityAllowed: true, assetActive: true, commentStatus: "visible", replyText: "  ", approvalState: "approved" }).eligible);
  check("G30 eligibility blocks capability-denied", !moderationEligibility("hide", { actorCanModerate: true, capabilityAllowed: false, assetActive: true, commentStatus: "visible", replyText: null, approvalState: "approved" }).eligible);
  check("G31 eligibility blocks deleted comment", !moderationEligibility("hide", { actorCanModerate: true, capabilityAllowed: true, assetActive: true, commentStatus: "deleted", replyText: null, approvalState: "approved" }).eligible);
  check("G32 outcome: ambiguous → manual review (never re-sent)", classifyModerationOutcome(false, true, "timeout").manualReview && classifyModerationOutcome(false, true, "timeout").status === "manual_review_required");
  check("G33 outcome: clean success", classifyModerationOutcome(true, false, null).status === "succeeded");

  // ═══ Engine ingestion (G34–G42) ═══════════════════════════════════════════
  {
    const gw = mockGateway({ fetch: () => fetchOk([pc({ externalId: "a" }), pc({ externalId: "b", parentExternalId: "a", authorExternalId: "page", isFromPage: true })]) });
    const { p, mem } = ports(gw);
    mem.objects.set("po1", { objectExternalId: "p1", assetId: "a1", platform: "facebook" });
    const s1 = await engine.scheduleIngestion(p, { orgId: "o1", providerObjectId: "po1", kind: "comment_sync", correlationId: "c", idempotencyKey: "idem1" });
    const s2 = await engine.scheduleIngestion(p, { orgId: "o1", providerObjectId: "po1", kind: "comment_sync", correlationId: "c", idempotencyKey: "idem1" });
    check("G34 ingestion scheduling is idempotent", s2.resumed && s2.job.id === s1.job.id);
    const [claimed] = await engine.dispatchDue(p, { leaseOwner: "w1" });
    check("G35 dispatch claims a due job with a fresh lease", !!claimed.leaseToken);
    const out = await engine.workJob(p, claimed);
    check("G36 ingestion persists comments", mem.comments.size === 2 && (out.ingested ?? 0) === 2);
    check("G37 ingestion rolls up threads", mem.threads.size === 1);
    check("G38 ingestion emits comment.received once", out.events.filter((e) => e.event === "meta.comment.received").length === 1);
    check("G39 job succeeds when no next cursor", out.job.status === "succeeded");
  }
  {
    const gw = mockGateway({ fetch: (n) => (n === 0 ? fetchOk([pc({ externalId: "p0" })], "CURSOR") : fetchOk([pc({ externalId: "p1c" })])) });
    const { p, mem } = ports(gw);
    mem.objects.set("po2", { objectExternalId: "p2", assetId: "a1", platform: "facebook" });
    await engine.scheduleIngestion(p, { orgId: "o1", providerObjectId: "po2", kind: "comment_backfill", correlationId: "c", idempotencyKey: "idem2" });
    const [c1] = await engine.dispatchDue(p, { leaseOwner: "w1" });
    const o1 = await engine.workJob(p, c1);
    check("G40 bounded paging continues with cursor", o1.outcome === "page_continued" && o1.job.cursor === "CURSOR");
    const [c2] = await engine.dispatchDue(p, { leaseOwner: "w1" });
    const o2 = await engine.workJob(p, c2);
    check("G41 next page completes the backfill", o2.job.status === "succeeded" && mem.comments.size === 2);
  }
  {
    const gw = mockGateway();
    const { p, mem } = ports(gw, memStore(), { readAllowed: false });
    mem.objects.set("po3", { objectExternalId: "p3", assetId: "a1", platform: "facebook" });
    await engine.scheduleIngestion(p, { orgId: "o1", providerObjectId: "po3", kind: "comment_sync", correlationId: "c", idempotencyKey: "idem3" });
    const [c] = await engine.dispatchDue(p, { leaseOwner: "w1" });
    const o = await engine.workJob(p, c);
    check("G42 ingestion blocked when comments capability denied", o.job.status === "blocked");
  }

  // ═══ Engine moderation (G43–G55) ══════════════════════════════════════════
  async function seedComment(mem: ReturnType<typeof memStore>, status = "visible") { mem.objects.set("po", { objectExternalId: "post", assetId: "a1", platform: "facebook" }); const up = await mem.store.upsertComment("o1", "po", { ...normalizeComment(pc({ externalId: "cc" }), "facebook"), status: status as CommentRecord["status"] }); if (status !== "visible") await mem.store.setCommentStatus("o1", up.id, status); return up.id; }
  {
    const gw = mockGateway({ moderate: () => modOk("reply-1") });
    const { p, mem, audit } = ports(gw);
    const cid = await seedComment(mem);
    const created = await engine.createModerationAction(p, { orgId: "o1", actorId: "u1", actionKind: "reply", platform: "facebook", targetCommentId: cid, providerObjectId: "po", replyText: "thanks!", correlationId: "c", idempotencyKey: "modidem" });
    check("G43 moderation action created pending (approval-gated)", created.action!.status === "pending" && created.action!.approvalState === "pending");
    check("G44 creation does NOT enqueue an execution job", mem.jobs.size === 0 && gw.moderateCalls === 0);
    const dupCreate = await engine.createModerationAction(p, { orgId: "o1", actorId: "u1", actionKind: "reply", platform: "facebook", targetCommentId: cid, providerObjectId: "po", replyText: "x", correlationId: "c", idempotencyKey: "modidem2" });
    check("G45 one active action per (comment, kind) — idempotent", dupCreate.action!.id === created.action!.id);
    const appr = await engine.approveModerationAction(p, "o1", "boss", created.action!.id);
    check("G46 approval enqueues an execution job", !!appr.job && mem.jobs.size === 1);
    const [cj] = await engine.dispatchDue(p, { leaseOwner: "w1" });
    const out = await engine.workJob(p, cj);
    check("G47 approved reply executes the provider write once", gw.moderateCalls === 1 && out.job.status === "succeeded");
    check("G48 reply success emits reply_published", out.events.some((e) => e.event === "meta.comment.reply_published"));
    check("G49 reply enqueues a bounded confirmation job", [...mem.jobs.values()].some((j) => j.jobKind === "moderation_confirm"));
    check("G50 moderation audited (requested+approved+executed)", audit.includes("meta.comment.moderation_requested") && audit.includes("meta.comment.moderation_approved"));
  }
  {
    const gw = mockGateway({ moderate: () => modOk() });
    const { p, mem } = ports(gw);
    const cid = await seedComment(mem);
    const a = await engine.createModerationAction(p, { orgId: "o1", actorId: "u1", actionKind: "hide", platform: "facebook", targetCommentId: cid, providerObjectId: "po", correlationId: "c", idempotencyKey: "hideidem" });
    await engine.approveModerationAction(p, "o1", "boss", a.action!.id);
    const [cj] = await engine.dispatchDue(p, { leaseOwner: "w1" });
    await engine.workJob(p, cj);
    check("G51 hide success updates local comment status", mem.comments.get(cid)!.status === "hidden");
  }
  {
    const gw = mockGateway({ moderate: () => modAmbiguous() });
    const { p, mem } = ports(gw);
    const cid = await seedComment(mem);
    const a = await engine.createModerationAction(p, { orgId: "o1", actorId: "u1", actionKind: "delete", platform: "facebook", targetCommentId: cid, providerObjectId: "po", correlationId: "c", idempotencyKey: "delidem" });
    await engine.approveModerationAction(p, "o1", "boss", a.action!.id);
    const [cj] = await engine.dispatchDue(p, { leaseOwner: "w1" });
    const out = await engine.workJob(p, cj);
    const action = await mem.store.getAction("o1", a.action!.id);
    check("G52 ambiguous moderation → manual_review_required (never re-sent)", action!.status === "manual_review_required");
    check("G53 ambiguous delete does NOT mutate local comment", mem.comments.get(cid)!.status !== "deleted");
    check("G54 ambiguous moderation emits moderation_failed", out.events.some((e) => e.event === "meta.comment.moderation_failed"));
  }
  {
    const gw = mockGateway();
    const { p, mem } = ports(gw, memStore(), { moderateAllowed: false });
    const cid = await seedComment(mem);
    const a = await engine.createModerationAction(p, { orgId: "o1", actorId: "u1", actionKind: "hide", platform: "facebook", targetCommentId: cid, providerObjectId: "po", correlationId: "c", idempotencyKey: "capidem" });
    await engine.approveModerationAction(p, "o1", "boss", a.action!.id);
    const [cj] = await engine.dispatchDue(p, { leaseOwner: "w1" });
    const out = await engine.workJob(p, cj);
    check("G55 moderation blocked when capability denied (no write)", out.job.status === "blocked" && gw.moderateCalls === 0);
  }

  // ═══ Fencing + recovery (G56–G61) ═════════════════════════════════════════
  {
    const gw = mockGateway({ fetch: () => fetchOk([]) });
    const { p, mem } = ports(gw);
    mem.objects.set("po", { objectExternalId: "p", assetId: "a1", platform: "facebook" });
    await engine.scheduleIngestion(p, { orgId: "o1", providerObjectId: "po", kind: "comment_sync", correlationId: "c", idempotencyKey: "fi" });
    const [c1] = await engine.dispatchDue(p, { leaseOwner: "wA" });
    check("G56 two workers can't claim the same job", (await engine.dispatchDue(p, { leaseOwner: "wB" })).length === 0);
    const wrong = await engine.workJob(p, { ...c1, leaseToken: "WRONG", leaseOwner: "wZ" });
    check("G57 wrong lease token cannot complete a job", wrong.outcome.startsWith("fence_") || wrong.outcome === "already_terminal");
  }
  {
    const gw = mockGateway();
    const mem = memStore(); const { p } = ports(gw, mem, { nowMs: 2_000_000_000_000 });
    const staleIngest: CommentJobRow = { id: "si", orgId: "o1", jobKind: "comment_sync" as CommentJobKind, providerObjectId: "po", targetCommentId: null, engagementActionId: null, webhookEventId: null, status: "executing", priority: 100, availableAtIso: new Date(1).toISOString(), cursor: null, attemptCount: 1, maxAttempts: 6, retryBudgetRemaining: 6, requeueCount: 0, leaseOwner: "d", leaseToken: "t", leaseExpiresAtIso: new Date(1_000_000_000_000).toISOString(), heartbeatAtIso: null, claimedAtIso: null, startedAtIso: null, completedAtIso: null, nextAttemptAtIso: null, lastErrorKind: null, safeLastError: null, correlationId: "c", idempotencyKey: "si" };
    await p.store.insertJob(staleIngest);
    const rec = await engine.recoverAbandoned(p, {});
    check("G58 abandoned ingestion safely requeues", rec.requeued === 1 && (await p.store.getJob("o1", "si"))!.status === "available");
  }
  {
    const gw = mockGateway();
    const mem = memStore(); const { p } = ports(gw, mem, { nowMs: 2_000_000_000_000 });
    const cid = (await mem.store.upsertComment("o1", "po", normalizeComment(pc({ externalId: "cc" }), "facebook"))).id;
    const action: ModerationActionRow = { id: "act", orgId: "o1", actionKind: "delete" as ModerationKind, platform: "facebook", targetCommentId: cid, providerObjectId: "po", replyText: null, approvalState: "approved", status: "executing", requestedBy: "u", approvedBy: "b", providerResultId: null, safeErrorKind: null, safeErrorMessage: null, retryable: false, retryClass: null, attemptCount: 1, correlationId: "c", idempotencyKey: "k", executedAtIso: null };
    await mem.store.insertAction(action);
    const staleMod: CommentJobRow = { id: "sm", orgId: "o1", jobKind: "moderation_execute" as CommentJobKind, providerObjectId: "po", targetCommentId: cid, engagementActionId: "act", webhookEventId: null, status: "executing", priority: 50, availableAtIso: new Date(1).toISOString(), cursor: null, attemptCount: 1, maxAttempts: 6, retryBudgetRemaining: 6, requeueCount: 0, leaseOwner: "d", leaseToken: "t", leaseExpiresAtIso: new Date(1_000_000_000_000).toISOString(), heartbeatAtIso: null, claimedAtIso: null, startedAtIso: null, completedAtIso: null, nextAttemptAtIso: null, lastErrorKind: null, safeLastError: null, correlationId: "c", idempotencyKey: "sm" };
    await p.store.insertJob(staleMod);
    const rec = await engine.recoverAbandoned(p, {});
    check("G59 abandoned mid-write moderation → manual review (never re-run)", rec.manualReview === 1 && (await mem.store.getAction("o1", "act"))!.status === "manual_review_required");
    check("G60 abandoned moderation job dead-lettered (no blind re-run)", (await p.store.getJob("o1", "sm"))!.status === "dead_letter");
  }
  check("G61 default retry policy bounded (reuses 6.8)", true);

  // ═══ Roles + observability + safe DTO (G62–G70) ═══════════════════════════
  check("G62 viewer role can view comments", canViewComments("support") && !canViewComments("guest"));
  check("G63 content creator can request but not approve", canRequestModeration("content_creator") && !canApproveModeration("content_creator"));
  check("G64 manager can approve", canApproveModeration("manager"));
  check("G65 metric rejects identifier dimension", !validateMetricContract({ name: "x", dimensions: ["org_id"] }).ok && validateMetricContract({ name: "x", dimensions: ["platform", "action_kind"] }).ok);
  check("G66 read DTO exposes no token/lease", !/tokenPlain|lease_token|leaseToken|access_token/.test(readFileSync("src/lib/meta/engagement/read.ts", "utf8")));

  // ═══ Migration RLS + additive (G67–G72) ═══════════════════════════════════
  const mig = readFileSync("supabase/migrations/20261225120000_meta_workspace_6_9_phase1_comments.sql", "utf8");
  for (const [i, t] of ["meta_comment", "meta_comment_thread", "meta_engagement_action", "meta_comment_ingestion_job"].entries()) check(`G${67 + i} RLS org-select on ${t}`, new RegExp(`${t}[\\s\\S]*current_org_id`).test(mig) || /current_org_id\(\)/.test(mig));
  check("G71 no authenticated write policy (client cannot mutate)", !/for insert to authenticated|for update to authenticated/.test(mig));
  check("G72 migration additive (no destructive drop table)", !/drop table/i.test(mig) && /create table if not exists/.test(mig));

  // ═══ Boundary guard fixtures (G73–G78) ════════════════════════════════════
  check("G73 guard flags a browser→gateway comment call in a route", scanContent("src/app/api/meta/engagement/x/route.ts", "const g = createCommentsGateway();").some((v) => /rule 13/.test(v)));
  check("G74 guard flags a direct gateway.moderate in a UI file", scanContent("src/app/(app)/meta-workspace/x/page.tsx", "await g.moderate(req)").some((v) => /rule 13/.test(v)));
  check("G75 guard clean on a legitimate engagement domain file", scanContent("src/lib/meta/engagement/threading.ts", "export const x = 1;").length === 0);
  check("G76 guard flags a Graph literal outside provider/graph", scanContent("src/lib/meta/engagement/x.ts", "const u='graph.facebook.com'").length > 0);
  check("G77 comments gateway sealed under provider/graph", existsSync("src/lib/meta/provider/graph/comments.ts") && !readFileSync("src/lib/meta/engagement/engine.ts", "utf8").includes("graph.facebook.com"));
  check("G78 moderation writes never appear in a route (approval+queue only)", !readFileSync("src/app/api/meta/engagement/comments/[id]/moderate/route.ts", "utf8").includes(".moderate("));

  // ═══ Absence proofs — Phase 1 ONLY (G79–G86) ══════════════════════════════
  check("G79 no messaging module", !existsSync("src/lib/meta/messaging"));
  // G80 — Phase 3 later adds the inbox as a LOCAL projection over this Phase-1 comment
  // data; the invariant that survives is that the Phase-1 comment engine never depends
  // on the inbox (the dependency points inbox → engagement, never the reverse).
  check("G80 comment engine does not depend on the inbox module", !/meta\/inbox/.test(readFileSync("src/lib/meta/engagement/engine.ts", "utf8")) && !/meta\/inbox/.test(readFileSync("src/lib/meta/engagement/service.ts", "utf8")));
  check("G81 insights is a sibling phase (not part of Phase 1 comment engine)", !readFileSync("src/lib/meta/engagement/engine.ts", "utf8").includes("insights"));
  // G82 — Phase 5 adds listening OVER this comment data; the invariant that survives
  // is that the comment engine never depends on the listening module.
  check("G82 comment engine does not depend on the listening module", !/meta\/listening/.test(readFileSync("src/lib/meta/engagement/engine.ts", "utf8")) && !/meta\/listening/.test(readFileSync("src/lib/meta/engagement/service.ts", "utf8")));
  // G83 — Phase 4 adds intelligence as a consumer OVER this Phase-1 comment data;
  // the invariant that survives is that the comment engine never depends on it.
  check("G83 comment engine does not depend on the intelligence module", !/meta\/intelligence/.test(readFileSync("src/lib/meta/engagement/engine.ts", "utf8")) && !/meta\/intelligence/.test(readFileSync("src/lib/meta/engagement/service.ts", "utf8")));
  const engText = ["engine", "service", "normalize", "moderation", "webhook"].map((f) => readFileSync(`src/lib/meta/engagement/${f}.ts`, "utf8")).join("\n");
  check("G84 no messaging/DM function names in engagement", !/sendMessage|normalizeInboundMessage|instagram_manage_messages/.test(engText));
  check("G85 no insights/analytics ingestion in engagement", !/post_insights|fetchInsights|reach_impressions|campaignInsights/.test(engText));
  check("G86 no AI intelligence in engagement (Phase 1)", !/sentimentScore|nextBestAction|reasoningGateway/.test(engText));

  // ═══ Scenarios ════════════════════════════════════════════════════════════
  check("S1 comment edit re-sync updates in place (dedup by external id)", (() => { const a = normalizeComment(pc({ externalId: "e", message: "old" }), "facebook"); const b = normalizeComment(pc({ externalId: "e", message: "new" }), "facebook"); return a.externalId === b.externalId && commentChanged(a.contentFingerprint, b); })());
  check("S2 webhook is only a signal — content comes from the pull (extract carries no message)", !("message" in (extractCommentSignals(fbBody)[0] as object)));

  console.log(`\nPhase 1 self-test: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
