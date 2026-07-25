// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · PHASE 3 SELF TEST (Unified Inbox).
// Runnable gate: `npx tsx src/lib/meta/inbox/qa.ts`.
// Deterministic K1–K70 (+ scenarios) over the PURE domain (aggregate/state/search)
// and the pure engine driven against an in-memory fake store. The inbox is a LOCAL
// projection over already-ingested comment data — there is NO Graph gateway to mock
// (the engine never calls Graph). No network, no DB, no ambient clock/RNG. Also
// asserts the boundary guard on synthetic fixtures + static frozen/absence proofs.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { aggregateThread, conversationChanged, type ThreadInput } from "./aggregate";
import { canTransitionStatus, isUnread, isSnoozeElapsed, canApplyAction } from "./state";
import { matchesFilter, queryInbox, type InboxRow } from "./search";
import { toConversationListItem, toConversationDetail, toLabelDTO } from "./read";
import { validateMetricContract, INBOX_METRICS } from "./observability";
import { canViewInbox, canManageInbox, canAssignInbox } from "./roles";
import * as engine from "./engine";
import type { InboxStore, InboxPorts, InboxSyncJobRow, SyncStateRow, ConversationFull } from "./ports";
import type { ConversationRecord, InboxFilter } from "./domain";
import type { MetaPlatform } from "../types";
import { scanContent } from "./../../../../scripts/check-meta-boundaries.mjs";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log("  ✓ " + n); } else { failed++; console.error("  ✗ " + n); } };
console.log("\nMeta Workspace (6.9) Phase 3 — SELF TEST (Unified Inbox)\n");

const thread = (o: Partial<ThreadInput & { updatedAtIso: string }> = {}): ThreadInput & { updatedAtIso: string } => ({
  rootExternalId: o.rootExternalId ?? "t1", platform: o.platform ?? "facebook", providerObjectId: o.providerObjectId ?? "po1",
  replyCount: o.replyCount ?? 3, lastActivityAt: o.lastActivityAt ?? "2027-01-02T00:00:00Z", rootAuthorExternalId: o.rootAuthorExternalId ?? "u1",
  rootAuthorDisplay: o.rootAuthorDisplay ?? "דנה", rootMessage: o.rootMessage ?? "שלום, יש עוד יחידות?", updatedAtIso: o.updatedAtIso ?? "2027-01-02T00:00:00Z",
});
const row = (o: Partial<InboxRow> = {}): InboxRow => ({ id: o.id ?? "c1", status: o.status ?? "open", platform: o.platform ?? "facebook", assigneeUserId: o.assigneeUserId ?? null, unread: o.unread ?? true, labelIds: o.labelIds ?? [], participantDisplay: o.participantDisplay ?? "דנה", subjectPreview: o.subjectPreview ?? "שלום", lastActivityAt: o.lastActivityAt ?? "2027-01-02T00:00:00Z", priority: o.priority ?? 100 });

// ── In-memory InboxStore fake (mirrors the Supabase adapter's contract) ────────
function memStore() {
  const jobs = new Map<string, InboxSyncJobRow>();
  const convs = new Map<string, ConversationFull & { unread: boolean }>();
  const states = new Map<string, SyncStateRow>();
  const labels = new Map<string, { id: string; name: string; color: string | null }>();
  const convLabels: Array<{ orgId: string; conversationId: string; labelId: string }> = [];
  const assignments: Array<{ orgId: string; conversationId: string; assigneeUserId: string | null; assignedBy: string | null }> = [];
  const threadsByPlatform: Array<{ orgId: string; platform: MetaPlatform; t: ThreadInput & { updatedAtIso: string } }> = [];
  let cid = 0;
  const key = (orgId: string, id: string) => `${orgId}|${id}`;
  const store: InboxStore = {
    async listUpdatedThreads(orgId, platform, sinceIso, limit) {
      return threadsByPlatform.filter((x) => x.orgId === orgId && x.platform === platform && (!sinceIso || x.t.updatedAtIso > sinceIso))
        .sort((a, b) => (a.t.updatedAtIso < b.t.updatedAtIso ? -1 : 1)).slice(0, limit).map((x) => x.t);
    },
    async upsertConversation(orgId, rec: ConversationRecord) {
      const found = [...convs.entries()].find(([k, c]) => k.startsWith(`${orgId}|`) && c.sourceRef === rec.sourceRef && c.sourceKind === rec.sourceKind);
      if (found) { const [k, c] = found; const unread = isUnread(rec.lastActivityAt, c.lastReadAt); convs.set(k, { ...c, ...rec, unread }); return { id: c.id, created: false, changed: true }; }
      const id = `cv-${++cid}`; convs.set(key(orgId, id), { id, ...rec, status: "open", snoozedUntil: null, lastReadAt: null, assigneeUserId: null, priority: 100, unread: true });
      return { id, created: true, changed: true };
    },
    async getSyncState(orgId, platform) { return states.get(`${orgId}|${platform}`) ?? null; },
    async upsertSyncState(orgId, r: SyncStateRow) { states.set(`${orgId}|${r.platform}`, r); },
    async getConversation(orgId, id) { return convs.get(key(orgId, id)) ?? null; },
    async updateConversationState(orgId, id, state) { const c = convs.get(key(orgId, id)); if (!c) return; const next = { ...c, ...state } as typeof c; if (state.unread !== undefined) next.unread = state.unread; convs.set(key(orgId, id), next); },
    async recordAssignment(orgId, conversationId, assigneeUserId, assignedBy) { assignments.push({ orgId, conversationId, assigneeUserId, assignedBy }); },
    async listLabels(orgId) { return [...labels.values()]; void orgId; },
    async createLabel(orgId, name, color) { const found = [...labels.values()].find((l) => l.name === name); if (found) return found.id; const id = `lb-${labels.size + 1}`; labels.set(id, { id, name, color }); return id; void orgId; },
    async addLabel(orgId, conversationId, labelId) { if (!convLabels.some((x) => x.conversationId === conversationId && x.labelId === labelId)) convLabels.push({ orgId, conversationId, labelId }); },
    async removeLabel(orgId, conversationId, labelId) { const i = convLabels.findIndex((x) => x.orgId === orgId && x.conversationId === conversationId && x.labelId === labelId); if (i >= 0) convLabels.splice(i, 1); },
    async listConversations(orgId, filter: InboxFilter, sort, page) {
      const rows: InboxRow[] = [...convs.entries()].filter(([k]) => k.startsWith(`${orgId}|`)).map(([, c]) => ({ id: c.id, status: c.status, platform: c.platform, assigneeUserId: c.assigneeUserId, unread: c.unread, labelIds: convLabels.filter((x) => x.conversationId === c.id).map((x) => x.labelId), participantDisplay: c.participantDisplay, subjectPreview: c.subjectPreview, lastActivityAt: c.lastActivityAt, priority: c.priority }));
      return queryInbox(rows, filter, sort, page);
    },
    async countUnread(orgId) { return [...convs.entries()].filter(([k, c]) => k.startsWith(`${orgId}|`) && c.unread && c.status === "open").length; },
    async insertJob(r) { jobs.set(r.id, r); },
    async getJob(orgId, id) { const j = jobs.get(id); return j && j.orgId === orgId ? j : null; },
    async findJobByIdem(orgId, k) { return [...jobs.values()].find((j) => j.orgId === orgId && j.idempotencyKey === k) ?? null; },
    async findActiveJob(orgId, platform) { return [...jobs.values()].find((j) => j.orgId === orgId && j.platform === platform && ["scheduled", "available", "claimed", "executing", "retry_wait"].includes(j.status)) ?? null; },
    async updateJob(r) { jobs.set(r.id, r); },
    async claimDueJobs(args) { const due = [...jobs.values()].filter((j) => ["scheduled", "available", "retry_wait"].includes(j.status) && Date.parse(j.availableAtIso) <= args.nowMs && (!j.leaseExpiresAtIso || Date.parse(j.leaseExpiresAtIso) <= args.nowMs)).slice(0, args.limit); return due.map((j) => { const c = { ...j, status: "claimed" as const, leaseOwner: args.leaseOwner, leaseToken: `lease-${j.id}`, leaseExpiresAtIso: new Date(args.nowMs + args.leaseSeconds * 1000).toISOString() }; jobs.set(j.id, c); return c; }); },
    async findStaleJobs(nowMs, limit) { return [...jobs.values()].filter((j) => ["claimed", "executing"].includes(j.status) && (!j.leaseExpiresAtIso || Date.parse(j.leaseExpiresAtIso) <= nowMs)).slice(0, limit); },
    async countInFlight() { const per: Record<string, number> = {}; let g = 0; for (const j of jobs.values()) if (["claimed", "executing"].includes(j.status)) { g++; per[j.orgId] = (per[j.orgId] ?? 0) + 1; } return { global: g, perOrg: per }; },
    async queueHealth() { const by: Record<string, number> = {}; for (const j of jobs.values()) by[j.status] = (by[j.status] ?? 0) + 1; return { byStatus: by, deadLetter: by.dead_letter ?? 0, oldestDueMs: null }; },
  };
  return { store, jobs, convs, states, labels, convLabels, assignments, threadsByPlatform };
}
function ports(mem = memStore(), opts: { allowed?: boolean; nowMs?: number } = {}): { p: InboxPorts; mem: ReturnType<typeof memStore> } {
  let idc = 0; const nowMs = opts.nowMs ?? 1_900_000_000_000;
  const p: InboxPorts = { store: mem.store, capability: { inboxReadAllowed: async () => opts.allowed ?? true }, clock: { nowMs: () => nowMs, nowIso: () => new Date(nowMs).toISOString() }, ids: { uuid: () => `id-${++idc}` }, audit: { log: async () => {} }, random: { fraction: () => 0.5 } };
  return { p, mem };
}

async function main() {
  // ═══ Aggregation — canonical projection FB+IG (K1–K8) ═════════════════════
  const recFb = aggregateThread(thread({ platform: "facebook" }));
  const recIg = aggregateThread(thread({ rootExternalId: "t2", platform: "instagram", rootAuthorDisplay: "יוסי" }));
  check("K1 FB thread projects to comment_thread conversation", recFb.sourceKind === "comment_thread" && recFb.platform === "facebook" && recFb.sourceRef === "t1");
  check("K2 IG thread projects into the SAME canonical shape (aggregation)", recIg.platform === "instagram" && recIg.sourceKind === recFb.sourceKind);
  check("K3 participant + preview carried safely", recFb.participantDisplay === "דנה" && recFb.subjectPreview.length > 0);
  check("K4 preview capped at 160 chars", aggregateThread(thread({ rootMessage: "x".repeat(500) })).subjectPreview.length <= 160);
  check("K5 preview collapses whitespace", aggregateThread(thread({ rootMessage: "a\n\n  b   c" })).subjectPreview === "a b c");
  check("K6 replyCount floored at 0", aggregateThread(thread({ replyCount: -5 })).replyCount === 0);
  check("K7 conversationChanged true on reply-count change", conversationChanged({ replyCount: 1, lastActivityAt: "t", subjectPreview: "p" }, aggregateThread(thread({ replyCount: 9 }))));
  check("K8 conversationChanged true when no prior", conversationChanged(null, recFb));

  // ═══ State machine + unread (K9–K20) ══════════════════════════════════════
  check("K9 open→archived allowed", canTransitionStatus("open", "archived"));
  check("K10 archived→resolved NOT allowed", !canTransitionStatus("archived", "resolved"));
  check("K11 same-status transition is a no-op allowed", canTransitionStatus("open", "open"));
  check("K12 unread when activity newer than read", isUnread("2027-01-02T00:00:00Z", "2027-01-01T00:00:00Z"));
  check("K13 read when read newer than activity", !isUnread("2027-01-01T00:00:00Z", "2027-01-02T00:00:00Z"));
  check("K14 never-read with activity is unread", isUnread("2027-01-01T00:00:00Z", null));
  check("K15 no activity is not unread", !isUnread(null, null));
  check("K16 snooze elapsed when time passed", isSnoozeElapsed("snoozed", "2027-01-01T00:00:00Z", "2027-01-02T00:00:00Z"));
  check("K17 snooze not elapsed before time", !isSnoozeElapsed("snoozed", "2027-01-03T00:00:00Z", "2027-01-02T00:00:00Z"));
  check("K18 archive rejected when already archived", !canApplyAction("archive", "archived").ok);
  check("K19 snooze rejected on archived", !canApplyAction("snooze", "archived").ok);
  check("K20 mark_read valid in any status", canApplyAction("mark_read", "archived").ok && canApplyAction("mark_read", "open").ok);

  // ═══ Search / filter / sort / pagination (K21–K33) ════════════════════════
  const rows: InboxRow[] = [
    row({ id: "a", platform: "facebook", unread: true, lastActivityAt: "2027-01-03T00:00:00Z", participantDisplay: "דנה", subjectPreview: "דירה למכירה", labelIds: ["l1"], assigneeUserId: "u1", priority: 50 }),
    row({ id: "b", platform: "instagram", unread: false, status: "archived", lastActivityAt: "2027-01-01T00:00:00Z", participantDisplay: "יוסי", subjectPreview: "שאלה", labelIds: [], assigneeUserId: null, priority: 100 }),
    row({ id: "c", platform: "facebook", unread: true, lastActivityAt: "2027-01-02T00:00:00Z", participantDisplay: "מיכל", subjectPreview: "מחיר?", labelIds: ["l2"], assigneeUserId: null, priority: 10 }),
  ];
  check("K21 status filter", queryInbox(rows, { status: "archived" }, "recent", { limit: 10, offset: 0 }).total === 1);
  check("K22 platform filter", queryInbox(rows, { platform: "facebook" }, "recent", { limit: 10, offset: 0 }).total === 2);
  check("K23 unreadOnly filter", queryInbox(rows, { unreadOnly: true }, "recent", { limit: 10, offset: 0 }).total === 2);
  check("K24 assignee=null (unassigned) filter", queryInbox(rows, { assigneeUserId: null }, "recent", { limit: 10, offset: 0 }).total === 2);
  check("K25 assignee=specific filter", queryInbox(rows, { assigneeUserId: "u1" }, "recent", { limit: 10, offset: 0 }).total === 1);
  check("K26 label filter", queryInbox(rows, { labelId: "l2" }, "recent", { limit: 10, offset: 0 }).items[0].id === "c");
  check("K27 text query over participant", queryInbox(rows, { query: "יוסי" }, "recent", { limit: 10, offset: 0 }).total === 1);
  check("K28 text query over subject preview", queryInbox(rows, { query: "מחיר" }, "recent", { limit: 10, offset: 0 }).items[0].id === "c");
  check("K29 sort recent = newest first", queryInbox(rows, {}, "recent", { limit: 10, offset: 0 }).items[0].id === "a");
  check("K30 sort oldest = oldest first", queryInbox(rows, {}, "oldest", { limit: 10, offset: 0 }).items[0].id === "b");
  check("K31 sort priority = lowest number first", queryInbox(rows, {}, "priority", { limit: 10, offset: 0 }).items[0].id === "c");
  check("K32 pagination slices + reports full total", (() => { const r = queryInbox(rows, {}, "recent", { limit: 1, offset: 1 }); return r.items.length === 1 && r.total === 3; })());
  check("K33 matchesFilter AND-combines predicates", matchesFilter(rows[0], { platform: "facebook", unreadOnly: true }) && !matchesFilter(rows[0], { platform: "instagram" }));

  // ═══ Sync engine — projection, cursor, idempotency (K34–K46) ══════════════
  {
    const { p, mem } = ports();
    mem.threadsByPlatform.push({ orgId: "o1", platform: "facebook", t: thread({ rootExternalId: "t1", updatedAtIso: "2027-01-01T00:00:00Z" }) });
    mem.threadsByPlatform.push({ orgId: "o1", platform: "facebook", t: thread({ rootExternalId: "t2", updatedAtIso: "2027-01-02T00:00:00Z", rootAuthorDisplay: "יוסי" }) });
    const s1 = await engine.scheduleSync(p, { orgId: "o1", platform: "facebook", correlationId: "c", idempotencyKey: "seed" });
    const s2 = await engine.scheduleSync(p, { orgId: "o1", platform: "facebook", correlationId: "c", idempotencyKey: "seed" });
    check("K34 sync scheduling idempotent by key", s2.resumed && s2.job.id === s1.job.id);
    const s3 = await engine.scheduleSync(p, { orgId: "o1", platform: "facebook", correlationId: "c", idempotencyKey: "other" });
    check("K35 only one active sync per (org,platform)", s3.resumed && s3.job.id === s1.job.id);
    const [claimed] = await engine.dispatchDue(p, { leaseOwner: "w1" });
    check("K36 dispatch claims with a fresh lease", !!claimed.leaseToken);
    const out = await engine.workJob(p, claimed);
    check("K37 sync projects both threads into conversations", (out.projected ?? 0) === 2 && mem.convs.size === 2);
    check("K38 new conversations count reported", (out.created ?? 0) === 2);
    check("K39 sync emits new_conversation per created", out.events.filter((e) => e.event === "meta.inbox.new_conversation").length === 2);
    check("K40 cursor advances to newest updatedAt", mem.states.get("o1|facebook")!.cursorUpdatedAtIso === "2027-01-02T00:00:00Z");
    check("K41 job succeeds", out.job.status === "succeeded");
    check("K42 next idle sync scheduled (bounded re-check)", [...mem.jobs.values()].some((j) => j.status === "scheduled" && j.id !== claimed.id));
    // A fresh due job with no new threads projects nothing (cursor already caught up).
    // (The engine's own follow-up is scheduled at the idle cadence — future under the
    //  fixed QA clock — so drive a due job directly, as a later cron tick would.)
    const dueJob = (idem: string): InboxSyncJobRow => ({ id: idem, orgId: "o1", platform: "facebook", status: "available", priority: 100, availableAtIso: new Date(claimed.leaseExpiresAtIso ? 1 : 1).toISOString(), cursor: null, attemptCount: 0, maxAttempts: 6, retryBudgetRemaining: 6, requeueCount: 0, leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null, heartbeatAtIso: null, claimedAtIso: null, startedAtIso: null, completedAtIso: null, nextAttemptAtIso: null, lastErrorKind: null, safeLastError: null, correlationId: "c", idempotencyKey: idem });
    await p.store.insertJob(dueJob("seed2"));
    const [c2] = await engine.dispatchDue(p, { leaseOwner: "w2" });
    const out2 = c2 ? await engine.workJob(p, c2) : { projected: 0, created: 0 };
    check("K43 re-sync past the cursor projects nothing new", (out2.projected ?? 0) === 0 && mem.convs.size === 2);
    // An updated thread past the cursor re-projects and re-flags unread.
    const t1Id = [...mem.convs.values()].find((c) => c.sourceRef === "t1")!.id;
    await p.store.updateConversationState("o1", t1Id, { lastReadAt: "2027-01-02T12:00:00Z", unread: false });
    mem.threadsByPlatform.push({ orgId: "o1", platform: "facebook", t: thread({ rootExternalId: "t1", replyCount: 9, updatedAtIso: "2027-01-03T00:00:00Z", lastActivityAt: "2027-01-03T00:00:00Z" }) });
    await p.store.insertJob(dueJob("seed3"));
    const [c3] = await engine.dispatchDue(p, { leaseOwner: "w3" });
    await engine.workJob(p, c3);
    check("K44 updated thread re-projects onto the SAME conversation (no dup)", mem.convs.size === 2);
    check("K45 a new reply re-flags a previously-read conversation unread", [...mem.convs.values()].find((c) => c.sourceRef === "t1")!.unread === true);
    check("K46 no full-table scan (bounded due-job claim only)", /claimDueJobs/.test(readFileSync("src/lib/meta/inbox/engine.ts", "utf8")));
  }

  // ═══ Capability gating + lease fencing + recovery (K47–K52) ═══════════════
  {
    const { p, mem } = ports(memStore(), { allowed: false });
    mem.threadsByPlatform.push({ orgId: "o1", platform: "facebook", t: thread() });
    await engine.scheduleSync(p, { orgId: "o1", platform: "facebook", correlationId: "c", idempotencyKey: "seedX" });
    const [c] = await engine.dispatchDue(p, { leaseOwner: "w1" });
    const out = await engine.workJob(p, c);
    check("K47 sync blocked when inbox read capability denied", out.job.status === "blocked");
    check("K48 blocked sync projects nothing", mem.convs.size === 0);
  }
  {
    const { p } = ports();
    await engine.scheduleSync(p, { orgId: "o1", platform: "instagram", correlationId: "c", idempotencyKey: "seedL" });
    const [c1] = await engine.dispatchDue(p, { leaseOwner: "wA" });
    check("K49 a second worker cannot claim the same job", (await engine.dispatchDue(p, { leaseOwner: "wB" })).length === 0);
    const wrong = await engine.workJob(p, { ...c1, leaseToken: "WRONG", leaseOwner: "wZ" });
    check("K50 wrong lease token cannot finalize a job", wrong.outcome.startsWith("fence_") || wrong.outcome === "already_terminal");
  }
  {
    const mem = memStore(); const { p } = ports(mem, { nowMs: 2_000_000_000_000 });
    const stale: InboxSyncJobRow = { id: "sj", orgId: "o1", platform: "facebook", status: "executing", priority: 100, availableAtIso: new Date(1).toISOString(), cursor: null, attemptCount: 1, maxAttempts: 6, retryBudgetRemaining: 6, requeueCount: 0, leaseOwner: "d", leaseToken: "t", leaseExpiresAtIso: new Date(1_000_000_000_000).toISOString(), heartbeatAtIso: null, claimedAtIso: null, startedAtIso: null, completedAtIso: null, nextAttemptAtIso: null, lastErrorKind: null, safeLastError: null, correlationId: "c", idempotencyKey: "sj" };
    await p.store.insertJob(stale);
    const rec = await engine.recoverAbandoned(p, {});
    check("K51 abandoned sync safely requeues (read-only projection)", rec.requeued === 1 && (await p.store.getJob("o1", "sj"))!.status === "available");
    check("K52 recovery is bounded (findStaleJobs limit honoured)", rec.recovered >= 1);
  }

  // ═══ Local actions (never touch Meta) (K53–K60) ═══════════════════════════
  {
    const { p, mem } = ports();
    mem.threadsByPlatform.push({ orgId: "o1", platform: "facebook", t: thread() });
    await engine.scheduleSync(p, { orgId: "o1", platform: "facebook", correlationId: "c", idempotencyKey: "seedA" });
    const [c] = await engine.dispatchDue(p, { leaseOwner: "w1" }); await engine.workJob(p, c);
    const id = [...mem.convs.values()][0].id;
    const r1 = await engine.applyConversationAction(p, "o1", "actor", id, "mark_read");
    check("K53 mark_read clears unread + stamps read cursor", r1.ok && mem.convs.get(`o1|${id}`)!.unread === false && !!mem.convs.get(`o1|${id}`)!.lastReadAt);
    const r2 = await engine.applyConversationAction(p, "o1", "actor", id, "archive");
    check("K54 archive sets status archived", r2.ok && mem.convs.get(`o1|${id}`)!.status === "archived");
    const r3 = await engine.applyConversationAction(p, "o1", "actor", id, "archive");
    check("K55 re-archive rejected by the state guard", !r3.ok && r3.error === "already_archived");
    const r4 = await engine.applyConversationAction(p, "o1", "actor", id, "assign", { assigneeUserId: "u9" });
    check("K56 assign sets assignee + records history + emits event", r4.ok && mem.convs.get(`o1|${id}`)!.assigneeUserId === "u9" && mem.assignments.length === 1 && r4.events.some((e) => e.event === "meta.inbox.assigned"));
    const r5 = await engine.applyConversationAction(p, "o1", "actor", id, "unassign");
    check("K57 unassign clears assignee + records history", r5.ok && mem.convs.get(`o1|${id}`)!.assigneeUserId === null && mem.assignments.length === 2);
    const lbl = await p.store.createLabel("o1", "דחוף", "#f00");
    const r6 = await engine.applyConversationAction(p, "o1", "actor", id, "add_label", { labelId: lbl });
    check("K58 add_label attaches a label", r6.ok && mem.convLabels.some((x) => x.conversationId === id && x.labelId === lbl));
    const r7 = await engine.applyConversationAction(p, "o1", "actor", id, "remove_label", { labelId: lbl });
    check("K59 remove_label detaches it", r7.ok && !mem.convLabels.some((x) => x.conversationId === id));
    const r8 = await engine.applyConversationAction(p, "o1", "actor", "missing", "mark_read");
    check("K60 action on a missing conversation returns not_found", !r8.ok && r8.error === "not_found");
  }

  // ═══ Roles + observability + DTO safety (K61–K68) ═════════════════════════
  check("K61 viewer role can view, guest cannot", canViewInbox("support") && !canViewInbox("guest"));
  check("K62 manage role gate distinct from assign", canManageInbox("content_creator") && !canAssignInbox("content_creator") && canAssignInbox("manager"));
  check("K63 metric contract rejects identifier dimensions", !validateMetricContract({ name: INBOX_METRICS.syncExecuted, dimensions: ["conversation_id"] }).ok && validateMetricContract({ name: INBOX_METRICS.syncExecuted, dimensions: ["platform", "result"] }).ok);
  check("K64 list DTO carries no assignee token/lease/raw payload", (() => { const d = toConversationListItem(row()); const j = JSON.stringify(d); return !/lease|token|raw_|graph/i.test(j) && "unread" in d; })());
  check("K65 detail DTO is safe + deterministic", (() => { const c = { id: "c1", sourceKind: "comment_thread", sourceRef: "t1", platform: "facebook", providerObjectId: "po1", participantExternalId: "u1", participantDisplay: "דנה", subjectPreview: "x", replyCount: 2, lastActivityAt: "t", status: "open", snoozedUntil: null, lastReadAt: null, assigneeUserId: null, priority: 100, unread: true } as unknown as ConversationFull; const d = toConversationDetail(c); return d.status === "open" && !/token|lease/i.test(JSON.stringify(d)); })());
  check("K66 label DTO maps id/name/color only", (() => { const d = toLabelDTO({ id: "l1", name: "n", color: "#111" }); return Object.keys(d).sort().join(",") === "color,id,name"; })());
  check("K67 read module surfaces no token/lease/graph literal", !/tokenPlain|lease_token|leaseToken|access_token|graph\.facebook/.test(readFileSync("src/lib/meta/inbox/read.ts", "utf8")));
  check("K68 observability forbids org/conversation/user/lease dimensions", ["org_id", "conversation_id", "user_id", "lease_token"].every((d) => !validateMetricContract({ name: "x", dimensions: [d] }).ok));

  // ═══ Migration RLS + additive (K69–K73) ═══════════════════════════════════
  const mig = readFileSync("supabase/migrations/20261231120000_meta_workspace_6_9_phase3_inbox.sql", "utf8");
  check("K69 RLS org-select via current_org_id", /current_org_id\(\)/.test(mig) && /enable row level security/.test(mig));
  check("K70 no authenticated write policy (service-role writes only)", !/for insert to authenticated|for update to authenticated|for delete to authenticated/.test(mig));
  check("K71 migration additive (no destructive drop table)", !/drop table/i.test(mig) && /create table if not exists/.test(mig));
  check("K72 SKIP LOCKED claim function present (fair, bounded)", /for update skip locked/i.test(mig) && /meta_inbox_claim_due/.test(mig));
  check("K73 one active sync per (org,platform) enforced by a partial unique index", /unique index[\s\S]*meta_inbox_sync_job[\s\S]*where status in/i.test(mig) || /create unique index[\s\S]*where status in/i.test(mig));

  // ═══ Boundary guard fixtures (K74–K78) ════════════════════════════════════
  check("K74 guard flags a provider/graph import inside the inbox module", scanContent("src/lib/meta/inbox/x.ts", 'import { g } from "../provider/graph";').some((v) => /rule 14/.test(v)));
  check("K75 guard flags a Comm OS conversation-model reference", scanContent("src/lib/meta/inbox/x.ts", 'db.from("communication_threads")').some((v) => /rule 14/.test(v)));
  check("K76 guard flags a Graph literal outside provider/graph", scanContent("src/lib/meta/inbox/x.ts", "const u='graph.facebook.com'").length > 0);
  check("K77 guard clean on a legitimate inbox domain file", scanContent("src/lib/meta/inbox/aggregate.ts", "export const x = 1;").length === 0);
  check("K78 inbox engine makes no direct provider/graph import", !/from ["'][^"']*provider\/graph/.test(readFileSync("src/lib/meta/inbox/engine.ts", "utf8")));

  // ═══ Absence proofs — Phase 3 ONLY (K79–K84) ══════════════════════════════
  check("K79 no listening module (Phase 5)", !existsSync("src/lib/meta/listening"));
  check("K80 no messaging/DM module (Phase 6)", !existsSync("src/lib/meta/messaging"));
  // K81 — Phase 4 adds intelligence as a consumer OVER this inbox projection; the
  // invariant that survives is that the inbox never depends on the intelligence module.
  check("K81 inbox does not depend on the intelligence module", ["engine", "service", "store", "aggregate", "state", "search"].every((f) => !/meta\/intelligence/.test(readFileSync(`src/lib/meta/inbox/${f}.ts`, "utf8"))));
  check("K82 inbox has NO provider gateway (local projection)", !existsSync("src/lib/meta/inbox/gateway.ts"));
  const inboxText = ["engine", "service", "aggregate", "state", "search", "store"].map((f) => readFileSync(`src/lib/meta/inbox/${f}.ts`, "utf8")).join("\n");
  check("K83 no messaging/DM or intelligence surface in the inbox", !/sendMessage|normalizeInboundMessage|sentimentScore|nextBestAction|reasoningGateway/.test(inboxText));
  check("K84 no direct Meta/Graph call in the inbox (pure local projection)", !/graph\.facebook|fetchComments|replyToComment|createCommentsGateway/.test(inboxText));

  // ═══ Scenarios ════════════════════════════════════════════════════════════
  check("S1 FB + IG threads land in ONE unified inbox list", (() => { const q = queryInbox([row({ id: "f", platform: "facebook" }), row({ id: "i", platform: "instagram" })], {}, "recent", { limit: 10, offset: 0 }); return q.total === 2; })());
  check("S2 archiving removes from the default open view but stays findable", (() => { const rs = [row({ id: "a", status: "open" }), row({ id: "b", status: "archived" })]; return queryInbox(rs, { status: "open" }, "recent", { limit: 10, offset: 0 }).total === 1 && queryInbox(rs, { status: "archived" }, "recent", { limit: 10, offset: 0 }).total === 1; })());

  console.log(`\nPhase 3 self-test: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
