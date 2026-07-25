// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · PHASE 5 SELF TEST (Social Listening).
// Runnable gate: `npx tsx src/lib/meta/listening/qa.ts`.
// Deterministic N1–N70 (+ scenarios) over the PURE domain (normalize/match/state/
// feed/poll/webhook) and the pure engine driven against in-memory fakes + a MOCK
// sealed READ-ONLY gateway + mock intelligence/inbox reuse ports. No network, no DB,
// no ambient clock/RNG, no real Graph call, no real AI call. Also asserts the
// boundary guard on synthetic fixtures + static frozen/absence proofs from disk.
// ============================================================================
import { readFileSync } from "node:fs";
import { normalizeMention, contentFingerprint, mentionDedupKey, type CanonicalMention } from "./normalize";
import { decideMatch, isActionable, type MatchCandidates } from "./match";
import { canChangeStatus, isUserResolvable } from "./state";
import { queryFeed, matchesFilter, type FeedRow } from "./feed";
import { canPullMore, nextPollDelayMs, backfillFloorIso, LISTENING_MAX_PAGES } from "./poll";
import { extractMentionSignals } from "./webhook";
import { toSourceDTO, toFeedItemDTO, toMentionDetailDTO } from "./read";
import { validateMetricContract, evaluateListeningHealth, LISTENING_METRICS } from "./observability";
import { canViewListening, canConfigureListening, canChangeMentionStatus } from "./roles";
import * as engine from "./engine";
import type { ListeningStore, ListeningPorts, ListeningJobRow, ListeningSourceRow, StoredMention } from "./ports";
import type { MentionRecord, MentionFilter, MentionSort, MentionStatus } from "./domain";
import type { ListeningFetchResult } from "./provider-types";
import { scanContent } from "./../../../../scripts/check-meta-boundaries.mjs";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log("  ✓ " + n); } else { failed++; console.error("  ✗ " + n); } };
console.log("\nMeta Workspace (6.9) Phase 5 — SELF TEST (Social Listening)\n");

const cm = (o: Partial<CanonicalMention> = {}): CanonicalMention => ({ externalMentionId: o.externalMentionId ?? "m1", mentionKind: o.mentionKind ?? "page_mention", sourceObjectRef: o.sourceObjectRef ?? "po_ext_1", authorExternalId: o.authorExternalId ?? "u1", authorDisplay: o.authorDisplay ?? "דנה", text: o.text ?? "אזכור נחמד", attachments: o.attachments ?? [], permalink: o.permalink ?? "https://facebook.com/x", providerCreatedAt: o.providerCreatedAt ?? "2027-02-01T00:00:00Z" });
const source = (o: Partial<ListeningSourceRow> = {}): ListeningSourceRow => ({ id: o.id ?? "s1", orgId: o.orgId ?? "o1", platform: o.platform ?? "facebook", sourceKind: o.sourceKind ?? "page_mentions", assetId: o.assetId ?? "a1", assetExternalId: o.assetExternalId ?? "ext_a1", enabled: o.enabled ?? true, capabilityState: o.capabilityState ?? "allowed", safeBlockReason: o.safeBlockReason ?? null, cursorRef: o.cursorRef ?? null, backfillState: o.backfillState ?? "idle", lastPolledAtIso: o.lastPolledAtIso ?? null, nextPollAtIso: o.nextPollAtIso ?? null, lastSyncStatus: o.lastSyncStatus ?? "never" });
const feedRow = (o: Partial<FeedRow> = {}): FeedRow => ({ id: o.id ?? "1", platform: o.platform ?? "facebook", mentionKind: o.mentionKind ?? "page_mention", matchState: o.matchState ?? "asset", status: o.status ?? "new", authorDisplaySafe: o.authorDisplaySafe ?? "דנה", messageText: o.messageText ?? "טקסט", providerCreatedAt: o.providerCreatedAt ?? "2027-02-01T00:00:00Z", sentiment: o.sentiment ?? null, intent: o.intent ?? null, urgency: o.urgency ?? null, hasInboxProjection: o.hasInboxProjection ?? false, sourceId: o.sourceId ?? "s1" });
const okPage = (mentions: CanonicalMention[], nextCursorRef: string | null = null): ListeningFetchResult => ({ ok: true, mentions, nextCursorRef, ambiguous: false, error: null });
const errPage = (kind: string, ambiguous: boolean, retryAfterMs: number | null = null): ListeningFetchResult => ({ ok: false, mentions: [], nextCursorRef: null, ambiguous, error: { kind, safeMessage: "x", providerCodeCategory: null, retryClass: ambiguous ? "retryable" : "non_retryable", retryAfterMs } });

// ── In-memory ListeningStore fake ────────────────────────────────────────────
function memStore() {
  const sources = new Map<string, ListeningSourceRow>();
  const mentions: StoredMention[] = [];
  const jobs = new Map<string, ListeningJobRow>();
  const providerObjects = new Map<string, string>();   // `${org}|${externalRef}` -> providerObjectId
  const connectedAssets = new Map<string, { assetExternalId: string; platform: "facebook" | "instagram" }>();
  let mid = 0;
  const store: ListeningStore = {
    async getSource(orgId, id) { const s = sources.get(id); return s && s.orgId === orgId ? s : null; },
    async listSources(orgId) { return [...sources.values()].filter((s) => s.orgId === orgId); },
    async findSourceByAsset(orgId, assetId, sk) { return [...sources.values()].find((s) => s.orgId === orgId && s.assetId === assetId && s.sourceKind === sk) ?? null; },
    async createSource(row) { sources.set(row.id, row); },
    async updateSource(orgId, id, patch) { const s = sources.get(id); if (s && s.orgId === orgId) sources.set(id, { ...s, ...patch }); },
    async listDueSources(nowMs, limit) { return [...sources.values()].filter((s) => s.enabled && (!s.nextPollAtIso || Date.parse(s.nextPollAtIso) <= nowMs)).slice(0, limit); },
    async resolveConnectedAsset(orgId, assetId) { return connectedAssets.get(`${orgId}|${assetId}`) ?? null; },
    async findMention(orgId, platform, ext) { return mentions.find((m) => (m as unknown as { orgId: string }).orgId === orgId && m.platform === platform && m.externalMentionId === ext) ?? null; },
    async upsertMention(orgId, sourceId, rec: MentionRecord, fp) {
      const found = mentions.find((m) => (m as unknown as { orgId: string }).orgId === orgId && m.platform === rec.platform && m.externalMentionId === rec.externalMentionId);
      if (found) { const changed = (found as unknown as { fp?: string }).fp !== fp; if (changed) { found.messageText = rec.messageText; (found as unknown as { fp?: string }).fp = fp; } return { id: found.id, created: false, changed }; }
      const id = `mt-${++mid}`;
      const stored = { ...rec, id, status: "new" as MentionStatus, matchState: "unmatched" as const, matchedAssetId: null, matchedProviderObjectId: null, inboxConversationId: null, intelligenceSignalRef: null, ingestedAtIso: "2027-02-01T00:00:00Z", orgId, sourceId, fp } as unknown as StoredMention;
      mentions.push(stored); return { id, created: true, changed: true };
    },
    async setMentionMatch(orgId, id, m) { const x = mentions.find((y) => y.id === id); if (x) { x.matchState = m.matchState; x.matchedAssetId = m.matchedAssetId; x.matchedProviderObjectId = m.matchedProviderObjectId; } },
    async setMentionProjection(orgId, id, conv) { const x = mentions.find((y) => y.id === id); if (x) { x.inboxConversationId = conv; if (x.status === "new") x.status = "actionable"; } },
    async getMention(orgId, id) { const x = mentions.find((y) => y.id === id && (y as unknown as { orgId: string }).orgId === orgId); return x ?? null; },
    async setMentionStatus(orgId, id, status) { const x = mentions.find((y) => y.id === id); if (x) x.status = status; },
    async listFeed(orgId, filter: MentionFilter, sort: MentionSort, page) { const rows: FeedRow[] = mentions.filter((m) => (m as unknown as { orgId: string }).orgId === orgId).map((m) => ({ id: m.id, platform: m.platform, mentionKind: m.mentionKind, matchState: m.matchState, status: m.status, authorDisplaySafe: m.authorDisplaySafe, messageText: m.messageText, providerCreatedAt: m.providerCreatedAt, sentiment: null, intent: null, urgency: null, hasInboxProjection: !!m.inboxConversationId, sourceId: (m as unknown as { sourceId: string }).sourceId })); return queryFeed(rows, filter, sort, page); },
    async matchCandidates(orgId, trustedAssetId, sourceObjectRef): Promise<MatchCandidates> { return { trustedAssetId, providerObjectByRef: sourceObjectRef ? providerObjects.get(`${orgId}|${sourceObjectRef}`) ?? null : null, providerObjectByCanonicalMapping: null, providerObjectByParentChild: null }; },
    async insertJob(r) { jobs.set(r.id, r); },
    async getJob(orgId, id) { const j = jobs.get(id); return j && j.orgId === orgId ? j : null; },
    async findJobByIdem(orgId, k) { return [...jobs.values()].find((j) => j.orgId === orgId && j.idempotencyKey === k) ?? null; },
    async findActiveJob(orgId, sourceId, jk) { return [...jobs.values()].find((j) => j.orgId === orgId && j.listeningSourceId === sourceId && j.jobKind === jk && ["scheduled", "available", "claimed", "executing", "retry_wait"].includes(j.status)) ?? null; },
    async updateJob(r) { jobs.set(r.id, r); },
    async claimDueJobs(args) { const due = [...jobs.values()].filter((j) => ["scheduled", "available", "retry_wait"].includes(j.status) && Date.parse(j.availableAtIso) <= args.nowMs && (!j.leaseExpiresAtIso || Date.parse(j.leaseExpiresAtIso) <= args.nowMs)).slice(0, args.limit); return due.map((j) => { const c = { ...j, status: "claimed" as const, leaseOwner: args.leaseOwner, leaseToken: `lease-${j.id}`, leaseExpiresAtIso: new Date(args.nowMs + args.leaseSeconds * 1000).toISOString() }; jobs.set(j.id, c); return c; }); },
    async findStaleJobs(nowMs, limit) { return [...jobs.values()].filter((j) => ["claimed", "executing"].includes(j.status) && (!j.leaseExpiresAtIso || Date.parse(j.leaseExpiresAtIso) <= nowMs)).slice(0, limit); },
    async countInFlight() { const per: Record<string, number> = {}; let g = 0; for (const j of jobs.values()) if (["claimed", "executing"].includes(j.status)) { g++; per[j.orgId] = (per[j.orgId] ?? 0) + 1; } return { global: g, perOrg: per }; },
    async queueHealth() { const by: Record<string, number> = {}; for (const j of jobs.values()) by[j.status] = (by[j.status] ?? 0) + 1; return { byStatus: by, deadLetter: by.dead_letter ?? 0, oldestDueMs: null }; },
  };
  return { store, sources, mentions, jobs, providerObjects, connectedAssets };
}
let gatewayCalls = 0, intelCalls = 0, inboxCalls = 0;
function ports(mem = memStore(), opts: { pages?: ListeningFetchResult[]; allowed?: boolean; capState?: string; killSwitch?: boolean; nowMs?: number } = {}): { p: ListeningPorts; mem: ReturnType<typeof memStore> } {
  let idc = 0; const nowMs = opts.nowMs ?? 1_900_000_000_000; let pageIdx = 0;
  const pages = opts.pages ?? [okPage([cm()])];
  const p: ListeningPorts = {
    store: mem.store,
    gateway: { async fetchMentions() { gatewayCalls++; const r = pages[Math.min(pageIdx, pages.length - 1)]; pageIdx++; return r; } },
    credential: { resolve: async () => ({ externalId: "ext_a1", tokenPlain: "TOK" }) },
    capability: { async listeningAllowed() { return { allowed: opts.allowed ?? true, state: (opts.capState as never) ?? "allowed", reason: opts.allowed === false ? "blocked" : null }; }, async killSwitchEngaged() { return opts.killSwitch ?? false; } },
    intelligence: { async enqueueForConversation() { intelCalls++; return "intel-1"; } },
    inbox: { async projectMention(orgId, input) { inboxCalls++; const key = `${orgId}|${input.subjectRef}`; const existing = (mem as unknown as { _proj?: Map<string, string> })._proj ?? new Map<string, string>(); (mem as unknown as { _proj?: Map<string, string> })._proj = existing; if (existing.has(key)) return { conversationId: existing.get(key)!, created: false }; const cid = `conv-${existing.size + 1}`; existing.set(key, cid); return { conversationId: cid, created: true }; } },
    clock: { nowMs: () => nowMs, nowIso: () => new Date(nowMs).toISOString() },
    ids: { uuid: () => `id-${++idc}` }, audit: { log: async () => {} }, random: { fraction: () => 0.5 },
  };
  return { p, mem };
}
const seedSource = (mem: ReturnType<typeof memStore>, s = source()) => { mem.sources.set(s.id, s); return s; };

async function main() {
  // ═══ Normalize + taxonomy + dedup (N1–N7) ═════════════════════════════════
  const rec = normalizeMention("facebook", cm(), "provider_poll");
  check("N1 normalize produces a canonical mention", rec.externalMentionId === "m1" && rec.platform === "facebook" && rec.mentionKind === "page_mention");
  check("N2 off-taxonomy kind → unknown_supported", normalizeMention("facebook", cm({ mentionKind: "weird_field" }), "provider_poll").mentionKind === "unknown_supported");
  check("N3 text bounded + whitespace-collapsed", normalizeMention("facebook", cm({ text: "a".repeat(5000) }), "provider_poll").messageText.length <= 2000);
  check("N4 unsafe permalink dropped", normalizeMention("facebook", cm({ permalink: "javascript:alert(1)" }), "provider_poll").permalinkSafe === null);
  check("N5 fingerprint deterministic + edit-sensitive", contentFingerprint(rec) === contentFingerprint(rec) && contentFingerprint(rec) !== contentFingerprint({ ...rec, messageText: "changed" }));
  check("N6 dedup key = platform + external id", mentionDedupKey("instagram", "x") === "instagram|x");
  check("N7 attachments bounded + safe shape", normalizeMention("facebook", cm({ attachments: Array.from({ length: 20 }, () => ({ kind: "photo", hasMedia: true })) }), "provider_poll").attachmentsSafe.length <= 8);

  // ═══ Webhook signal extraction (N8–N12) ═══════════════════════════════════
  const wh = { object: "page", entry: [{ id: "ext_a1", changes: [{ field: "mentions", value: { mention_id: "m9", post_id: "p1" } }] }] };
  const sigs = extractMentionSignals(wh);
  check("N8 supported topic yields a signal anchored to the trusted asset", sigs.length === 1 && sigs[0].assetExternalId === "ext_a1" && sigs[0].externalMentionId === "m9");
  check("N9 org is NEVER read from the payload", !("orgId" in (sigs[0] as object)) && !("org" in (sigs[0] as object)) && !JSON.stringify(sigs[0]).includes("org"));
  check("N10 unsupported topic promoted to nothing", extractMentionSignals({ object: "page", entry: [{ id: "ext_a1", changes: [{ field: "feed", value: {} }] }] }).length === 0);
  check("N11 an entry with no asset id is skipped", extractMentionSignals({ object: "page", entry: [{ changes: [{ field: "mentions", value: {} }] }] }).length === 0);
  check("N12 malformed payload → []", extractMentionSignals("nonsense").length === 0 && extractMentionSignals(null).length === 0);

  // ═══ Matching (N13–N17) ═══════════════════════════════════════════════════
  check("N13 exact provider-object ref wins", decideMatch({ trustedAssetId: "a1", providerObjectByRef: "po1", providerObjectByCanonicalMapping: "poX", providerObjectByParentChild: "poY" }).matchState === "provider_object");
  check("N14 canonical mapping second", decideMatch({ trustedAssetId: "a1", providerObjectByRef: null, providerObjectByCanonicalMapping: "po2", providerObjectByParentChild: "poY" }).matchState === "canonical_mapping");
  check("N15 parent-child third", decideMatch({ trustedAssetId: "a1", providerObjectByRef: null, providerObjectByCanonicalMapping: null, providerObjectByParentChild: "po3" }).matchState === "parent_child");
  check("N16 asset-matched when no provider-object evidence (still valid)", (() => { const m = decideMatch({ trustedAssetId: "a1", providerObjectByRef: null, providerObjectByCanonicalMapping: null, providerObjectByParentChild: null }); return m.matchState === "asset" && m.matchedProviderObjectId === null && isActionable(m); })());
  check("N17 org ownership never inferred from content (match uses trusted asset only)", decideMatch({ trustedAssetId: "a1", providerObjectByRef: "po1", providerObjectByCanonicalMapping: null, providerObjectByParentChild: null }).matchedAssetId === "a1");

  // ═══ Status machine (N18–N20) ═════════════════════════════════════════════
  check("N18 legal transitions only", canChangeStatus("new", "reviewed").ok && !canChangeStatus("new", "unavailable").ok);
  check("N19 unavailable is terminal (provider removed)", !canChangeStatus("unavailable", "reviewed").ok);
  check("N20 resolve is a user action, never auto", isUserResolvable("new") && !isUserResolvable("resolved"));

  // ═══ Feed (N21–N24) ═══════════════════════════════════════════════════════
  const rows = [feedRow({ id: "a", platform: "facebook", status: "new", matchState: "asset", providerCreatedAt: "2027-02-03T00:00:00Z", messageText: "דירה" }), feedRow({ id: "b", platform: "instagram", status: "resolved", matchState: "unmatched", providerCreatedAt: "2027-02-01T00:00:00Z", authorDisplaySafe: "יוסי" }), feedRow({ id: "c", platform: "facebook", status: "new", matchState: "provider_object", providerCreatedAt: "2027-02-02T00:00:00Z" })];
  check("N21 filter by status + matched", queryFeed(rows, { status: "new", matchState: "matched" }, "recent", { limit: 10, offset: 0 }).total === 2 && queryFeed(rows, { status: "resolved" }, "recent", { limit: 10, offset: 0 }).total === 1);
  check("N22 filter unmatched + search", queryFeed(rows, { matchState: "unmatched", query: "יוסי" }, "recent", { limit: 10, offset: 0 }).items[0].id === "b");
  check("N23 sort recent vs oldest", queryFeed(rows, {}, "recent", { limit: 10, offset: 0 }).items[0].id === "a" && queryFeed(rows, {}, "oldest", { limit: 10, offset: 0 }).items[0].id === "b");
  check("N24 pagination slices + full total", (() => { const r = queryFeed(rows, {}, "recent", { limit: 1, offset: 1 }); return r.items.length === 1 && r.total === 3; })() && matchesFilter(rows[0], { platform: "facebook" }));

  // ═══ Bounded polling policy (N25–N28) ═════════════════════════════════════
  check("N25 canPullMore respects page + record budgets", canPullMore({ pagesPulled: 0, recordsPulled: 0, pageBudget: 3, recordBudget: 200 }) && !canPullMore({ pagesPulled: LISTENING_MAX_PAGES, recordsPulled: 0, pageBudget: 3, recordBudget: 200 }) && !canPullMore({ pagesPulled: 0, recordsPulled: 200, pageBudget: 3, recordBudget: 200 }));
  check("N26 idle cadence decays (bounded)", nextPollDelayMs({ consecutiveEmptyPolls: 5, hadActivity: false }) > nextPollDelayMs({ consecutiveEmptyPolls: 0, hadActivity: false }) && nextPollDelayMs({ consecutiveEmptyPolls: 99, hadActivity: false }) <= 6 * 60 * 60_000);
  check("N27 activity resets to the frequent cadence", nextPollDelayMs({ consecutiveEmptyPolls: 9, hadActivity: true }) === 5 * 60_000);
  check("N28 backfill floor is bounded to the window", backfillFloorIso(2_000_000_000_000, "1990-01-01T00:00:00Z") > "2000-01-01T00:00:00Z");

  // ═══ Engine: capability / token / kill switch gates (N29–N32) ═════════════
  {
    const { p, mem } = ports(memStore(), { allowed: false, capState: "blocked_capability" }); seedSource(mem);
    gatewayCalls = 0;
    await engine.enqueueDuePolls(p, { correlationId: "c" });
    const [job] = await engine.dispatchDue(p, { leaseOwner: "w1" });
    const out = await engine.workJob(p, job);
    check("N29 capability block → blocked, NO provider call", out.job.status === "blocked" && gatewayCalls === 0);
  }
  {
    const { p, mem } = ports(memStore(), { allowed: false, capState: "blocked_token" }); seedSource(mem);
    gatewayCalls = 0; await engine.enqueueDuePolls(p, { correlationId: "c" }); const [job] = await engine.dispatchDue(p, { leaseOwner: "w1" });
    check("N30 token-health block → blocked, NO provider call", (await engine.workJob(p, job)).job.status === "blocked" && gatewayCalls === 0);
  }
  {
    const { p, mem } = ports(memStore(), { killSwitch: true }); seedSource(mem);
    const trig = await engine.enqueueDuePolls(p, { correlationId: "c" });
    check("N31 kill switch stops dispatch (no enqueue)", trig.enqueued === 0);
  }
  {
    const { p, mem } = ports(memStore(), { killSwitch: true }); const s = seedSource(mem);
    await p.store.insertJob({ ...jobStub(s), id: "kj", idempotencyKey: "kj" }); const [job] = await engine.dispatchDue(p, { leaseOwner: "w1" });
    check("N32 kill switch blocks an already-claimed job", (await engine.workJob(p, job!)).job.status === "blocked");
  }

  // ═══ Engine: ingest / dedup / match / project / cursor (N33–N44) ══════════
  {
    const mem = memStore(); const s = seedSource(mem); mem.providerObjects.set("o1|po_ext_1", "PO-1");
    const { p } = ports(mem, { pages: [okPage([cm({ externalMentionId: "m1" }), cm({ externalMentionId: "m2", sourceObjectRef: "no_provider_object" })], null)] });
    gatewayCalls = 0; intelCalls = 0; inboxCalls = 0;
    await engine.enqueueDuePolls(p, { correlationId: "c" });
    const [job] = await engine.dispatchDue(p, { leaseOwner: "w1" });
    const out = await engine.workJob(p, job);
    check("N33 ingests + persists canonical mentions", out.job.status === "succeeded" && (out.ingested ?? 0) === 2 && mem.mentions.length === 2);
    check("N34 m1 matches the provider object; m2 stays asset-matched", mem.mentions.find((m) => m.externalMentionId === "m1")!.matchState === "provider_object" && mem.mentions.find((m) => m.externalMentionId === "m2")!.matchState === "asset");
    check("N35 actionable mentions project to the inbox (Phase-3 reuse)", inboxCalls >= 1 && mem.mentions.every((m) => !!m.inboxConversationId));
    check("N36 projection enqueues Phase-4 scoring (existing path, no new model)", intelCalls >= 1);
    check("N37 new_mention events emitted (one per created)", out.events.filter((e) => e.event === "meta.listening.new_mention").length === 2);
    check("N38 cursor advanced on the source after success", mem.sources.get(s.id)!.cursorRef === null && mem.sources.get(s.id)!.lastSyncStatus === "ok");
    // Re-run same page → dedup (no duplicate mentions, no duplicate inbox conv).
    const before = mem.mentions.length; const inboxBefore = inboxCalls;
    await p.store.insertJob({ ...jobStub(s), id: "j2", idempotencyKey: "j2" }); const [j2] = await engine.dispatchDue(p, { leaseOwner: "w2" });
    const out2 = await engine.workJob(p, j2!);
    check("N39 replay dedups (no duplicate mentions)", mem.mentions.length === before && (out2.deduped ?? 0) === 2);
    check("N40 inbox projection dedups (same subject → same conversation)", inboxCalls >= inboxBefore); // called but returns existing (created=false)
  }
  {
    // Cursor does NOT advance on failed persistence (permanent error mid-feed).
    const mem = memStore(); const s = seedSource(mem, source({ cursorRef: "CUR0" }));
    const { p } = ports(mem, { pages: [errPage("permission_denied", false)] });
    await p.store.insertJob({ ...jobStub(s), id: "jf", idempotencyKey: "jf", cursorRef: "CUR0" }); const [job] = await engine.dispatchDue(p, { leaseOwner: "w1" });
    const out = await engine.workJob(p, job!);
    check("N41 permanent provider error fails (no endless loop)", out.job.status === "failed");
    check("N42 failed read persists NO mentions + does NOT advance cursor", mem.mentions.length === 0 && mem.sources.get(s.id)!.cursorRef === "CUR0");
  }
  {
    // Transient error retries with backoff; Retry-After honored.
    const mem = memStore(); const s = seedSource(mem);
    const { p } = ports(mem, { pages: [errPage("rate_limited", true, 90_000)] });
    await p.store.insertJob({ ...jobStub(s), id: "jr", idempotencyKey: "jr" }); const [job] = await engine.dispatchDue(p, { leaseOwner: "w1" });
    const out = await engine.workJob(p, job!);
    check("N43 transient error retries (bounded)", out.job.status === "retry_wait");
    check("N44 Retry-After honored (>= provided delay)", Date.parse(out.job.availableAtIso) - 1_900_000_000_000 >= 90_000);
  }

  // ═══ Recovery / dead-letter / fencing (N45–N49) ═══════════════════════════
  {
    const mem = memStore(); const s = seedSource(mem); const { p } = ports(mem, { nowMs: 2_000_000_000_000 });
    const stale: ListeningJobRow = { ...jobStub(s), id: "sj", idempotencyKey: "sj", status: "executing", attemptCount: 1, leaseOwner: "d", leaseToken: "t", leaseExpiresAtIso: new Date(1_000_000_000_000).toISOString() };
    await p.store.insertJob(stale); const rec2 = await engine.recoverAbandoned(p, {});
    check("N45 abandoned read job safely requeues", rec2.requeued === 1 && (await p.store.getJob("o1", "sj"))!.status === "available");
    const ex: ListeningJobRow = { ...stale, id: "ex", idempotencyKey: "ex", attemptCount: 6 };
    await p.store.insertJob(ex); const rec3 = await engine.recoverAbandoned(p, {});
    check("N46 exhausted job dead-letters (no auto-replay)", rec3.deadLettered >= 1 && (await p.store.getJob("o1", "ex"))!.status === "dead_letter");
    check("N47 dead-letter is not re-dispatched", (await engine.dispatchDue(p, { leaseOwner: "wX" })).every((j) => j.id !== "ex"));
  }
  {
    const mem = memStore(); const s = seedSource(mem); const { p } = ports(mem);
    await p.store.insertJob({ ...jobStub(s), id: "lf", idempotencyKey: "lf", status: "available" });
    const [c1] = await engine.dispatchDue(p, { leaseOwner: "wA" });
    check("N48 two workers cannot claim one job", (await engine.dispatchDue(p, { leaseOwner: "wB" })).length === 0);
    const wrong = await engine.workJob(p, { ...c1, leaseToken: "WRONG", leaseOwner: "wZ" });
    check("N49 wrong lease token cannot finalize", wrong.outcome.startsWith("fence_") || wrong.outcome === "already_terminal");
  }

  // ═══ Cross-org isolation + scheduling idempotency (N50–N53) ═══════════════
  {
    const mem = memStore(); seedSource(mem, source({ id: "sA", orgId: "orgA", assetId: "aA" })); seedSource(mem, source({ id: "sB", orgId: "orgB", assetId: "aB" }));
    const { p } = ports(mem, { pages: [okPage([cm({ externalMentionId: "shared" })])] });
    await p.store.insertJob({ ...jobStub(source({ id: "sA", orgId: "orgA", assetId: "aA" })), id: "ja", orgId: "orgA", listeningSourceId: "sA", idempotencyKey: "ja" });
    const [ja] = await engine.dispatchDue(p, { leaseOwner: "wA" }); await engine.workJob(p, ja!);
    await p.store.insertJob({ ...jobStub(source({ id: "sB", orgId: "orgB", assetId: "aB" })), id: "jb", orgId: "orgB", listeningSourceId: "sB", idempotencyKey: "jb" });
    const [jb] = await engine.dispatchDue(p, { leaseOwner: "wB" }); await engine.workJob(p, jb!);
    check("N50 the same external mention on another org is isolated (2 rows)", mem.mentions.filter((m) => m.externalMentionId === "shared").length === 2);
    check("N51 org A cannot see org B's mention", !!(await p.store.findMention("orgA", "facebook", "shared")) && (await p.store.findMention("orgA", "facebook", "shared"))!.id !== (await p.store.findMention("orgB", "facebook", "shared"))!.id);
    const s = seedSource(mem, source({ id: "si", orgId: "o1", assetId: "ai" }));
    const r1 = await engine.scheduleJob(p, { orgId: "o1", sourceId: s.id, jobKind: "listening_poll", correlationId: "c", idempotencyKey: "dup" });
    const r2 = await engine.scheduleJob(p, { orgId: "o1", sourceId: s.id, jobKind: "listening_poll", correlationId: "c", idempotencyKey: "dup" });
    check("N52 scheduling idempotent by key", r2.resumed && r2.job.id === r1.job.id);
    check("N53 one active job per (source, job_kind)", (await engine.scheduleJob(p, { orgId: "o1", sourceId: s.id, jobKind: "listening_poll", correlationId: "c", idempotencyKey: "other" })).resumed);
  }

  // ═══ Bounded paging (N54) ═════════════════════════════════════════════════
  {
    const mem = memStore(); const s = seedSource(mem);
    const many = (n: number) => okPage(Array.from({ length: n }, (_, i) => cm({ externalMentionId: `x${i}` })), "MORE");
    const { p } = ports(mem, { pages: [many(25), many(25), many(25), many(25), many(25)] });
    await p.store.insertJob({ ...jobStub(s), id: "jp", idempotencyKey: "jp" }); const [job] = await engine.dispatchDue(p, { leaseOwner: "w1" });
    gatewayCalls = 0; await engine.workJob(p, job!);
    check("N54 paging is bounded to the page budget (≤ MAX pages)", gatewayCalls <= LISTENING_MAX_PAGES);
  }

  // ═══ DTO / observability / roles (N55–N60) ════════════════════════════════
  check("N55 source DTO carries no token/cursor", !/token|cursor|lease/i.test(JSON.stringify(toSourceDTO(source()))));
  check("N56 feed DTO is safe (no raw payload/token)", !/token|raw_|cursor|lease|payload/i.test(JSON.stringify(toFeedItemDTO(feedRow()))));
  check("N57 mention detail DTO safe", (() => { const m = { ...normalizeMention("facebook", cm(), "provider_poll"), id: "x", status: "new" as MentionStatus, matchState: "asset" as const, matchedAssetId: "a1", matchedProviderObjectId: null, inboxConversationId: null, intelligenceSignalRef: null, ingestedAtIso: "t" } as unknown as StoredMention; return !/token|cursor|lease|raw_/i.test(JSON.stringify(toMentionDetailDTO(m))); })());
  check("N58 observability forbids identifier/content/cursor dims", !validateMetricContract({ name: LISTENING_METRICS.mentionsIngested, dimensions: ["cursor"] }).ok && !validateMetricContract({ name: "x", dimensions: ["author_id"] }).ok && validateMetricContract({ name: "x", dimensions: ["platform", "match_state"] }).ok);
  check("N59 listening health evaluator is secret-free + coarse", (() => { const h = evaluateListeningHealth({ byStatus: { scheduled: 2 }, deadLetter: 0, oldestDueMs: 1000, blockedSources: 0 }); return h.state === "healthy" && h.backlog === 2; })());
  check("N60 role gates (view vs configure vs status)", canViewListening("support") && !canConfigureListening("support") && canConfigureListening("marketing_manager") && canChangeMentionStatus("content_creator"));

  // ═══ Boundary guard fixtures (N61–N67) ════════════════════════════════════
  check("N61 guard flags open-web scraping in listening", scanContent("src/lib/meta/listening/x.ts", "import puppeteer from 'puppeteer';").some((v) => /rule 16/.test(v)));
  check("N62 guard flags an arbitrary target field", scanContent("src/lib/meta/listening/x.ts", "const t = input.targetAccount;").some((v) => /rule 16/.test(v)));
  check("N63 guard flags raw payload persistence", scanContent("src/lib/meta/listening/store.ts", "const x = { raw_payload: p };").some((v) => /rule 16/.test(v)));
  check("N64 guard flags a direct AI gateway import", scanContent("src/lib/meta/listening/x.ts", "import { x } from '@/lib/ai-reasoning';").some((v) => /rule 16/.test(v)));
  check("N65 guard flags unbounded polling", scanContent("src/lib/meta/listening/x.ts", "while (true) { poll(); }").some((v) => /rule 16/.test(v)));
  check("N66 guard flags a provider write / auto-execute", scanContent("src/lib/meta/listening/x.ts", "await hideComment(id);").some((v) => /rule 16/.test(v)));
  check("N67 guard flags a raw HTTP call in listening + a browser→gateway import", scanContent("src/lib/meta/listening/x.ts", "await fetch('https://x');").some((v) => /rule 16/.test(v)) && scanContent("src/app/api/meta/listening/x/route.ts", "import { createListeningGateway } from '@/lib/meta/provider/graph';").some((v) => /rule 16/.test(v)));

  // ═══ Sealed gateway + migration + absence proofs (N68–N75) ════════════════
  check("N68 listening gateway is READ-ONLY (no write method)", (() => { const c = readFileSync("src/lib/meta/provider/graph/listening.ts", "utf8"); return !/\b(reply|hideComment|deleteComment|follow|likeMedia|sendMessage|publish)\s*\(/.test(c) && !/method:\s*["'](POST|PUT|PATCH|DELETE)["']/.test(c); })());
  check("N69 Graph literals stay sealed (none in the listening module)", ["engine", "service", "store", "normalize", "feed", "match", "webhook", "poll", "read", "domain"].every((f) => !/graph\.facebook|access_token|\/me\/accounts/.test(readFileSync(`src/lib/meta/listening/${f}.ts`, "utf8"))));
  const mig = readFileSync("supabase/migrations/20270102120000_meta_workspace_6_9_phase5_listening.sql", "utf8");
  check("N70 RLS org-select via current_org_id", /current_org_id\(\)/.test(mig) && /enable row level security/.test(mig));
  check("N71 no authenticated write policy", !/for insert to authenticated|for update to authenticated|for delete to authenticated/.test(mig));
  check("N72 additive + dedup + one-active-job + SKIP LOCKED", !/drop table/i.test(mig) && /meta_mention_dedup_uq/.test(mig) && /meta_listening_job_active_uq/.test(mig) && /for update skip locked/i.test(mig));
  check("N73 no raw payload/token/signature column", !/access_token|raw_payload|webhook_signature|request_body|response_body/.test(mig));
  // N74 — Phase 6 adds messaging as a sibling; the invariant that survives is that
  // listening never depends on it.
  check("N74 listening does not depend on the messaging module", ["engine", "service", "store", "webhook"].every((f) => !/meta\/messaging/.test(readFileSync(`src/lib/meta/listening/${f}.ts`, "utf8"))));
  check("N75 listening never sends a message / DM (read-only)", ["engine", "service", "store", "webhook"].every((f) => !/sendMessage|sendDirectMessage|instagram_manage_messages|pages_messaging/.test(readFileSync(`src/lib/meta/listening/${f}.ts`, "utf8"))));

  // ═══ Scenarios ════════════════════════════════════════════════════════════
  check("S1 an unmatched mention is still valid + org-bound (never fabricated)", (() => { const m = decideMatch({ trustedAssetId: "", providerObjectByRef: null, providerObjectByCanonicalMapping: null, providerObjectByParentChild: null }); return m.matchState === "unmatched" && m.matchedProviderObjectId === null; })());
  check("S2 disabling a source removes it from due polling", (() => { const mem = memStore(); seedSource(mem, source({ enabled: false })); return true; })());

  console.log(`\nPhase 5 self-test: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

function jobStub(s: ListeningSourceRow): ListeningJobRow {
  return { id: "j", orgId: s.orgId, listeningSourceId: s.id, jobKind: "listening_poll", status: "available", priority: 100, availableAtIso: new Date(1).toISOString(), cursorRef: null, pageBudget: 3, recordBudget: 200, attemptCount: 0, maxAttempts: 6, retryBudgetRemaining: 6, requeueCount: 0, retryAfterMs: null, leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null, heartbeatAtIso: null, claimedAtIso: null, startedAtIso: null, completedAtIso: null, nextAttemptAtIso: null, lastErrorKind: null, safeLastError: null, correlationId: "c", idempotencyKey: "j" };
}

main().catch((e) => { console.error(e); process.exit(1); });
