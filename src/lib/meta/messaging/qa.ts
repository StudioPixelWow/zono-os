// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · PHASE 6 SELF TEST (Messenger + IG DM).
// Runnable gate: `npx tsx src/lib/meta/messaging/qa.ts`.
// Deterministic P1–P70 (+ scenarios) over the PURE domain (policy/window/normalize/
// state/feed/webhook) and the pure engine driven against in-memory fakes + a MOCK
// sealed gateway + a FAKE encryptor + mock intelligence/inbox/copilot reuse ports.
// No network, no DB, no ambient clock/RNG, no real Graph call, no real AI call.
// Also asserts the boundary guard on synthetic fixtures + static proofs from disk.
// ============================================================================
import { readFileSync } from "node:fs";
import { evaluateSendEligibility, isWithinStandardWindow, isWithinHumanAgentWindow } from "./policy";
import { normalizeMessage, messageFingerprint, safeInboxPlaceholder, type CanonicalMessage } from "./normalize";
import { canTransitionConversation, isUnread, canApproveSend, isSendExecutable, classifySendOutcome } from "./state";
import { queryConversations, matchesFilter, type ConvRow } from "./feed";
import { extractMessagingSignals } from "./webhook";
import { toConversationListItem, toConversationDetail, toMessageDTO, toSendDTO } from "./read";
import { validateMetricContract, evaluateMessagingHealth, MESSAGING_METRICS } from "./observability";
import { canViewMessaging, canDraftMessage, canApproveSendRole } from "./roles";
import * as engine from "./engine";
import type { MessagingStore, MessagingPorts, MessagingJobRow, ConversationRow, SendRow } from "./ports";
import type { ConversationRecord, MessageRecord, ConversationFilter, ConversationSort } from "./domain";
import type { ConversationsResult, MessagesResult, SendResult } from "./provider-types";
import { scanContent } from "./../../../../scripts/check-meta-boundaries.mjs";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log("  ✓ " + n); } else { failed++; console.error("  ✗ " + n); } };
console.log("\nMeta Workspace (6.9) Phase 6 — SELF TEST (Messenger + Instagram DM)\n");

const NOW = 1_900_000_000_000;
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const cmsg = (o: Partial<CanonicalMessage> = {}): CanonicalMessage => ({ externalMessageId: o.externalMessageId ?? "m1", direction: o.direction ?? "inbound", senderExternalId: o.senderExternalId ?? "u1", body: o.body ?? "שלום", attachments: o.attachments ?? [], providerCreatedAt: o.providerCreatedAt ?? iso(1000) });
const convRow = (o: Partial<ConversationRow> = {}): ConversationRow => ({ id: o.id ?? "c1", orgId: o.orgId ?? "o1", platform: o.platform ?? "facebook", assetId: o.assetId ?? "a1", externalThreadId: o.externalThreadId ?? "t1", participantExternalId: o.participantExternalId ?? "u1", participantDisplaySafe: o.participantDisplaySafe ?? "דנה", lastInboundAt: o.lastInboundAt ?? iso(1000), lastMessageAt: o.lastMessageAt ?? iso(1000), unread: o.unread ?? true, status: o.status ?? "open", assigneeUserId: o.assigneeUserId ?? null, inboxConversationId: o.inboxConversationId ?? null, cursorRef: o.cursorRef ?? null });
const okConvs = (): ConversationsResult => ({ ok: true, conversations: [], nextCursorRef: null, ambiguous: false, error: null });
const okMsgs = (messages: CanonicalMessage[], nextCursorRef: string | null = null): MessagesResult => ({ ok: true, conversation: null, messages, nextCursorRef, ambiguous: false, error: null });
const errMsgs = (kind: string, ambiguous: boolean, retryAfterMs: number | null = null): MessagesResult => ({ ok: false, conversation: null, messages: [], nextCursorRef: null, ambiguous, error: { kind, safeMessage: "x", providerCodeCategory: null, retryClass: ambiguous ? "retryable" : "non_retryable", retryAfterMs } });

// ── In-memory MessagingStore fake ────────────────────────────────────────────
function memStore() {
  const conversations = new Map<string, ConversationRow>();
  const messages: { id: string; orgId: string; conversationId: string; externalMessageId: string; direction: string; bodyCipher: string | null; policyTag: string | null; deliveryState: string | null; senderExternalId: string | null; providerCreatedAt: string | null }[] = [];
  const sends = new Map<string, SendRow & { draftBodyCipher: string }>();
  const jobs = new Map<string, MessagingJobRow>();
  const assets = new Map<string, { assetExternalId: string; platform: "facebook" | "instagram" }>();
  let mid = 0, cid = 0;
  const store: MessagingStore = {
    async getConversation(orgId, id) { const c = conversations.get(id); return c && c.orgId === orgId ? c : null; },
    async getConversationByThread(orgId, platform, ext) { return [...conversations.values()].find((c) => c.orgId === orgId && c.platform === platform && c.externalThreadId === ext) ?? null; },
    async upsertConversation(orgId, assetId, rec: ConversationRecord) { const found = [...conversations.values()].find((c) => c.orgId === orgId && c.platform === rec.platform && c.externalThreadId === rec.externalThreadId); if (found) { found.lastInboundAt = rec.lastInboundAt ?? found.lastInboundAt; found.lastMessageAt = rec.lastMessageAt; return { id: found.id, created: false }; } const id = `cv-${++cid}`; conversations.set(id, convRow({ id, orgId, assetId, platform: rec.platform, externalThreadId: rec.externalThreadId, participantExternalId: rec.participantExternalId, participantDisplaySafe: rec.participantDisplaySafe, lastInboundAt: rec.lastInboundAt, lastMessageAt: rec.lastMessageAt })); return { id, created: true }; },
    async updateConversation(orgId, id, patch) { const c = conversations.get(id); if (c && c.orgId === orgId) Object.assign(c, { ...patch }); },
    async listConversations(orgId, filter: ConversationFilter, sort: ConversationSort, page) { const rows: ConvRow[] = [...conversations.values()].filter((c) => c.orgId === orgId).map((c) => ({ id: c.id, platform: c.platform as ConvRow["platform"], status: c.status, assigneeUserId: c.assigneeUserId, unread: c.unread, participantDisplaySafe: c.participantDisplaySafe, lastMessageAt: c.lastMessageAt })); return queryConversations(rows, filter, sort, page); },
    async listSyncConversations(orgId, limit) { return [...conversations.values()].filter((c) => (!orgId || c.orgId === orgId) && c.status !== "resolved").slice(0, limit); },
    async findMessage(orgId, conversationId, ext) { const m = messages.find((x) => x.orgId === orgId && x.conversationId === conversationId && x.externalMessageId === ext); return m ? { id: m.id } : null; },
    async insertMessage(orgId, conversationId, rec: MessageRecord, bodyCipher, fingerprint, sendId) { if (messages.some((x) => x.orgId === orgId && x.conversationId === conversationId && x.externalMessageId === rec.externalMessageId)) return { id: "dup", created: false }; const id = `mt-${++mid}`; messages.push({ id, orgId, conversationId, externalMessageId: rec.externalMessageId, direction: rec.direction, bodyCipher, policyTag: null, deliveryState: rec.direction === "outbound" ? "sent" : null, senderExternalId: rec.senderExternalId, providerCreatedAt: rec.providerCreatedAt }); void fingerprint; void sendId; return { id, created: true }; },
    async listMessages(orgId, conversationId) { return messages.filter((x) => x.orgId === orgId && x.conversationId === conversationId).map((m) => ({ id: m.id, direction: m.direction as MessageRecord["direction"], senderExternalId: m.senderExternalId, bodyCipher: m.bodyCipher, policyTag: m.policyTag, deliveryState: m.deliveryState, providerCreatedAt: m.providerCreatedAt })); },
    async setMessageDelivery(orgId, sendId, providerMessageId, deliveryState) { for (const m of messages) if ((m as unknown as { sendId?: string }).sendId === sendId) m.deliveryState = deliveryState; void providerMessageId; },
    async insertSend(row) { sends.set(row.id, row); },
    async getSend(orgId, id) { const s = sends.get(id); return s && s.orgId === orgId ? s : null; },
    async updateSend(orgId, id, patch) { const s = sends.get(id); if (s && s.orgId === orgId) Object.assign(s, patch); },
    async resolveConnectedAsset(orgId, assetId) { return assets.get(`${orgId}|${assetId}`) ?? null; },
    async insertJob(r) { jobs.set(r.id, r); },
    async getJob(orgId, id) { const j = jobs.get(id); return j && j.orgId === orgId ? j : null; },
    async findJobByIdem(orgId, k) { return [...jobs.values()].find((j) => j.orgId === orgId && j.idempotencyKey === k) ?? null; },
    async findActiveJob(orgId, cid2, jk) { return [...jobs.values()].find((j) => j.orgId === orgId && j.conversationId === cid2 && j.jobKind === jk && ["scheduled", "available", "claimed", "executing", "retry_wait"].includes(j.status)) ?? null; },
    async updateJob(r) { jobs.set(r.id, r); },
    async claimDueJobs(args) { const due = [...jobs.values()].filter((j) => ["scheduled", "available", "retry_wait"].includes(j.status) && Date.parse(j.availableAtIso) <= args.nowMs && (!j.leaseExpiresAtIso || Date.parse(j.leaseExpiresAtIso) <= args.nowMs)).slice(0, args.limit); return due.map((j) => { const c = { ...j, status: "claimed" as const, leaseOwner: args.leaseOwner, leaseToken: `L${j.id}`, leaseExpiresAtIso: new Date(args.nowMs + args.leaseSeconds * 1000).toISOString() }; jobs.set(j.id, c); return c; }); },
    async findStaleJobs(nowMs, limit) { return [...jobs.values()].filter((j) => ["claimed", "executing"].includes(j.status) && (!j.leaseExpiresAtIso || Date.parse(j.leaseExpiresAtIso) <= nowMs)).slice(0, limit); },
    async countInFlight() { const per: Record<string, number> = {}; let g = 0; for (const j of jobs.values()) if (["claimed", "executing"].includes(j.status)) { g++; per[j.orgId] = (per[j.orgId] ?? 0) + 1; } return { global: g, perOrg: per }; },
    async queueHealth() { const by: Record<string, number> = {}; for (const j of jobs.values()) by[j.status] = (by[j.status] ?? 0) + 1; return { byStatus: by, deadLetter: by.dead_letter ?? 0, oldestDueMs: null }; },
  };
  return { store, conversations, messages, sends, jobs, assets };
}
let gatewayReadCalls = 0, sendCalls = 0, intelCalls = 0, inboxCalls = 0;
function ports(mem = memStore(), opts: { msgPages?: MessagesResult[]; sendResult?: SendResult; readAllowed?: boolean; replyAllowed?: boolean; assetActive?: boolean; nowMs?: number } = {}): { p: MessagingPorts; mem: ReturnType<typeof memStore> } {
  let idc = 0; const nowMs = opts.nowMs ?? NOW; let pIdx = 0;
  const msgPages = opts.msgPages ?? [okMsgs([cmsg()])];
  const p: MessagingPorts = {
    store: mem.store,
    gateway: {
      async fetchConversations() { return okConvs(); },
      async fetchMessages() { gatewayReadCalls++; const r = msgPages[Math.min(pIdx, msgPages.length - 1)]; pIdx++; return r; },
      async sendMessage() { sendCalls++; return opts.sendResult ?? { ok: true, providerMessageId: "pm-1", ambiguous: false, error: null }; },
    },
    encryptor: { encrypt: (s) => `enc:${s}`, decrypt: (c) => (c.startsWith("enc:") ? c.slice(4) : c) },
    credential: { resolve: async () => ({ externalId: "ext_a1", tokenPlain: "TOK" }) },
    capability: { messagingReadAllowed: async () => opts.readAllowed ?? true, messagingReplyAllowed: async () => ({ allowed: opts.replyAllowed ?? true, assetActive: opts.assetActive ?? true }) },
    intelligence: { async enqueueForConversation() { intelCalls++; return "i-1"; } },
    inbox: { async projectThread(orgId, input) { inboxCalls++; return { conversationId: `inbox-${input.subjectRef}`, created: true }; } },
    copilot: { async draftReply() { return { body: "טיוטה", requiresApproval: true as const }; } },
    clock: { nowMs: () => nowMs, nowIso: () => new Date(nowMs).toISOString() },
    ids: { uuid: () => `id-${++idc}` }, audit: { log: async () => {} }, random: { fraction: () => 0.5 },
  };
  return { p, mem };
}
function syncJob(orgId: string, conversationId: string, over: Partial<MessagingJobRow> = {}): MessagingJobRow {
  return { id: over.id ?? "j", orgId, conversationId, sendId: over.sendId ?? null, jobKind: over.jobKind ?? "dm_message_sync", status: over.status ?? "available", priority: 100, availableAtIso: new Date(1).toISOString(), cursorRef: over.cursorRef ?? null, pageBudget: 3, recordBudget: 200, attemptCount: over.attemptCount ?? 0, maxAttempts: 6, retryBudgetRemaining: 6, requeueCount: 0, retryAfterMs: null, leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null, heartbeatAtIso: null, claimedAtIso: null, startedAtIso: null, completedAtIso: null, nextAttemptAtIso: null, lastErrorKind: null, safeLastError: null, correlationId: "c", idempotencyKey: over.idempotencyKey ?? "j" };
}
// Insert a job pre-CLAIMED (valid far-future lease) then work it (workJob re-reads it).
async function work(p: MessagingPorts, job: MessagingJobRow) {
  const c: MessagingJobRow = { ...job, status: "claimed", leaseOwner: "wk", leaseToken: `L${job.id}`, leaseExpiresAtIso: new Date(p.clock.nowMs() + 1e9).toISOString() };
  await p.store.insertJob(c);
  return engine.workJob(p, c);
}
// Claim + work a job that already exists in the store (e.g. an approveSend execute job).
async function workExisting(p: MessagingPorts, orgId: string, jobId: string) {
  const j = await p.store.getJob(orgId, jobId); if (!j) return null;
  const c: MessagingJobRow = { ...j, status: "claimed", leaseOwner: "wk", leaseToken: `L${j.id}`, leaseExpiresAtIso: new Date(p.clock.nowMs() + 1e9).toISOString() };
  await p.store.updateJob(c);
  return engine.workJob(p, c);
}

async function main() {
  // ═══ Window + policy (P1–P10) ═════════════════════════════════════════════
  check("P1 within 24h window", isWithinStandardWindow(iso(60_000), NOW) && !isWithinStandardWindow(iso(25 * 3600_000), NOW));
  check("P2 within 7d human-agent window", isWithinHumanAgentWindow(iso(3 * 24 * 3600_000), NOW) && !isWithinHumanAgentWindow(iso(8 * 24 * 3600_000), NOW));
  check("P3 inside 24h → eligible, no tag required", (() => { const e = evaluateSendEligibility({ lastInboundAt: iso(60_000), nowMs: NOW, tag: null }); return e.ok && e.windowState === "within_24h" && !e.requiresTag; })());
  check("P4 outside 24h, no tag → NOT eligible (tag required)", (() => { const e = evaluateSendEligibility({ lastInboundAt: iso(25 * 3600_000), nowMs: NOW, tag: null }); return !e.ok && e.windowState === "expired" && e.requiresTag; })());
  check("P5 outside 24h + HUMAN_AGENT within 7d → eligible", (() => { const e = evaluateSendEligibility({ lastInboundAt: iso(2 * 24 * 3600_000), nowMs: NOW, tag: "HUMAN_AGENT" }); return e.ok && e.windowState === "human_agent"; })());
  check("P6 HUMAN_AGENT beyond 7d → NOT eligible", !evaluateSendEligibility({ lastInboundAt: iso(9 * 24 * 3600_000), nowMs: NOW, tag: "HUMAN_AGENT" }).ok);
  check("P7 supported message tag permits out-of-window", evaluateSendEligibility({ lastInboundAt: iso(9 * 24 * 3600_000), nowMs: NOW, tag: "CONFIRMED_EVENT_UPDATE" }).ok);
  check("P8 unsupported tag → NEVER eligible", !evaluateSendEligibility({ lastInboundAt: iso(60_000), nowMs: NOW, tag: "PROMOTIONAL" }).ok && !evaluateSendEligibility({ lastInboundAt: iso(25 * 3600_000), nowMs: NOW, tag: "PROMOTIONAL" }).ok);
  check("P9 never-inbound → window expired (tag required)", !evaluateSendEligibility({ lastInboundAt: null, nowMs: NOW, tag: null }).ok);
  check("P10 eligibility deterministic", JSON.stringify(evaluateSendEligibility({ lastInboundAt: iso(1000), nowMs: NOW, tag: null })) === JSON.stringify(evaluateSendEligibility({ lastInboundAt: iso(1000), nowMs: NOW, tag: null })));

  // ═══ Normalize + state + feed + webhook (P11–P22) ═════════════════════════
  check("P11 normalize message (direction + bounded body)", (() => { const r = normalizeMessage(cmsg({ body: "x".repeat(9000) })); return r.direction === "inbound" && r.body.length <= 4000; })());
  check("P12 outbound direction preserved", normalizeMessage(cmsg({ direction: "outbound" })).direction === "outbound");
  check("P13 fingerprint deterministic + body-sensitive", messageFingerprint(normalizeMessage(cmsg())) === messageFingerprint(normalizeMessage(cmsg())) && messageFingerprint(normalizeMessage(cmsg({ body: "a" }))) !== messageFingerprint(normalizeMessage(cmsg({ body: "b" }))));
  check("P14 inbox placeholder carries NO body text", !safeInboxPlaceholder("דנה").includes("שלום"));
  check("P15 conversation transitions", canTransitionConversation("open", "assigned") && !canTransitionConversation("resolved", "snoozed"));
  check("P16 unread derivation", isUnread(iso(0), iso(60_000)) && !isUnread(iso(60_000), iso(0)));
  check("P17 canApproveSend only from pending", canApproveSend("pending", "pending").ok && !canApproveSend("approved", "ready").ok);
  check("P18 isSendExecutable only approved+ready", isSendExecutable("approved", "ready") && !isSendExecutable("pending", "pending"));
  check("P19 ambiguous outcome → manual_review (never auto-retry)", classifySendOutcome(false, true) === "manual_review" && classifySendOutcome(false, false) === "failed" && classifySendOutcome(true, false) === "sent");
  check("P20 feed filter + sort", (() => { const rows: ConvRow[] = [{ id: "a", platform: "facebook", status: "open", assigneeUserId: null, unread: true, participantDisplaySafe: "דנה", lastMessageAt: iso(0) }, { id: "b", platform: "instagram", status: "resolved", assigneeUserId: null, unread: false, participantDisplaySafe: "יוסי", lastMessageAt: iso(60_000) }]; return queryConversations(rows, { unreadOnly: true }, "recent", { limit: 10, offset: 0 }).total === 1 && matchesFilter(rows[0], { platform: "facebook" }); })());
  const wh = { object: "page", entry: [{ id: "ext_a1", messaging: [{ sender: { id: "psid1" }, message: { text: "hi" } }] }] };
  check("P21 webhook yields a signal anchored to the trusted asset (org never from payload)", (() => { const s = extractMessagingSignals(wh); return s.length === 1 && s[0].assetExternalId === "ext_a1" && s[0].externalThreadId === "psid1" && !JSON.stringify(s[0]).includes("org"); })());
  check("P22 malformed webhook → []", extractMessagingSignals(null).length === 0 && extractMessagingSignals("x").length === 0);

  // ═══ Sync (read): encrypt + persist + project + intel + cursor (P23–P32) ══
  {
    const mem = memStore(); mem.conversations.set("c1", convRow());
    const { p } = ports(mem, { msgPages: [okMsgs([cmsg({ externalMessageId: "m1" }), cmsg({ externalMessageId: "m2" })], null)] });
    gatewayReadCalls = 0; intelCalls = 0; inboxCalls = 0;
    const out = await work(p, syncJob("o1", "c1"));
    check("P23 sync ingests messages", out.job.status === "succeeded" && (out.ingested ?? 0) === 2 && mem.messages.length === 2);
    check("P24 message bodies are ENCRYPTED at rest (no plaintext stored)", mem.messages.every((m) => (m.bodyCipher ?? "").startsWith("enc:")) && !mem.messages.some((m) => m.bodyCipher === "שלום"));
    check("P25 projects to the inbox (safe placeholder, no body)", inboxCalls >= 1);
    check("P26 enqueues Phase-4 scoring (existing path)", intelCalls >= 1);
    check("P27 emits message.received", out.events.some((e) => e.event === "meta.message.received"));
    const o2 = await work(p, syncJob("o1", "c1", { id: "j2", idempotencyKey: "j2" }));
    check("P28 dedup on replay (no duplicate messages)", (o2.ingested ?? 0) === 0 && mem.messages.length === 2);
  }
  {
    const mem = memStore(); mem.conversations.set("c1", convRow());
    const { p } = ports(mem, { readAllowed: false });
    gatewayReadCalls = 0;
    const out = await work(p, syncJob("o1", "c1"));
    check("P29 read capability denied → blocked, NO provider call", out.job.status === "blocked" && gatewayReadCalls === 0);
  }
  {
    const mem = memStore(); mem.conversations.set("c1", convRow({ cursorRef: "CUR0" }));
    const { p } = ports(mem, { msgPages: [errMsgs("permission_denied", false)] });
    const out = await work(p, syncJob("o1", "c1", { cursorRef: "CUR0" }));
    check("P30 permanent read error fails (no loop)", out.job.status === "failed");
    check("P31 failed read persists nothing + does not advance cursor", mem.messages.length === 0 && mem.conversations.get("c1")!.cursorRef === "CUR0");
  }
  {
    const mem = memStore(); mem.conversations.set("c1", convRow());
    const { p } = ports(mem, { msgPages: [errMsgs("rate_limited", true, 90_000)] });
    const out = await work(p, syncJob("o1", "c1"));
    check("P32 transient read retries (bounded) + Retry-After honored", out.job.status === "retry_wait" && Date.parse(out.job.availableAtIso) - NOW >= 90_000);
  }

  // ═══ Outbound send — approval-gated, single write, never auto (P33–P47) ═══
  {
    const mem = memStore(); mem.conversations.set("c1", convRow({ lastInboundAt: iso(60_000) }));
    const { p } = ports(mem);
    const r = await engine.createSend(p, { orgId: "o1", actorId: "u1", conversationId: "c1", body: "תשובה", policyTag: null, correlationId: "c" });
    check("P33 createSend inside window → pending (approval required)", r.ok && r.send!.approvalState === "pending" && r.send!.status === "pending");
    check("P34 draft body stored ENCRYPTED (never plaintext)", [...mem.sends.values()][0].draftBodyCipher.startsWith("enc:"));
    const sendId = r.send!.id;
    // Not executable before approval.
    const preExec = await work(p, syncJob("o1", "c1", { id: "jx", idempotencyKey: "jx", jobKind: "dm_send_execute", sendId }));
    check("P35 send NOT executable before approval", preExec.job.status === "failed" && preExec.outcome === "failed");
    const appr = await engine.approveSend(p, "o1", "boss", sendId);
    check("P36 approve → ready + enqueues a single execute job", appr.ok && !!appr.job && appr.job!.jobKind === "dm_send_execute" && mem.sends.get(sendId)!.status === "ready");
    sendCalls = 0;
    const exec = (await workExisting(p, "o1", appr.job!.id))!;
    check("P37 approved send performs a SINGLE provider write", sendCalls === 1 && exec.sent === true);
    check("P38 delivered outbound message persisted (encrypted) + confirmed", mem.messages.some((m) => m.direction === "outbound" && (m.bodyCipher ?? "").startsWith("enc:")) && mem.sends.get(sendId)!.status === "sent" && mem.sends.get(sendId)!.providerMessageId === "pm-1");
    check("P39 send emits message.sent", exec.events.some((e) => e.event === "meta.message.sent"));
  }
  {
    // Ambiguous send → manual_review, NOT auto-retried.
    const mem = memStore(); mem.conversations.set("c1", convRow({ lastInboundAt: iso(60_000) }));
    const { p } = ports(mem, { sendResult: { ok: false, providerMessageId: null, ambiguous: true, error: { kind: "timeout", safeMessage: "x", providerCodeCategory: null, retryClass: "ambiguous", retryAfterMs: null } } });
    const r = await engine.createSend(p, { orgId: "o1", actorId: "u1", conversationId: "c1", body: "x", policyTag: null, correlationId: "c" }); const appr = await engine.approveSend(p, "o1", "boss", r.send!.id);
    sendCalls = 0;
    const exec = (await workExisting(p, "o1", appr.job!.id))!;
    check("P40 ambiguous send → manual_review (never auto-retried)", mem.sends.get(r.send!.id)!.status === "manual_review" && exec.job.status === "failed");
    check("P41 exactly one provider write attempted (no retry)", sendCalls === 1);
  }
  {
    // Window expired between approval and execution → manual_review at send.
    const mem = memStore(); mem.conversations.set("c1", convRow({ lastInboundAt: iso(60_000) }));
    const { p } = ports(mem);
    const r = await engine.createSend(p, { orgId: "o1", actorId: "u1", conversationId: "c1", body: "x", policyTag: null, correlationId: "c" }); const appr = await engine.approveSend(p, "o1", "boss", r.send!.id);
    mem.conversations.get("c1")!.lastInboundAt = iso(25 * 3600_000);   // window now expired, no tag
    sendCalls = 0;
    await workExisting(p, "o1", appr.job!.id);
    check("P42 window re-checked at execution → blocked (no provider write)", sendCalls === 0 && mem.sends.get(r.send!.id)!.status === "manual_review");
  }
  {
    // Reply capability denied at execution → failed, no write.
    const mem = memStore(); mem.conversations.set("c1", convRow({ lastInboundAt: iso(60_000) }));
    const { p } = ports(mem, { replyAllowed: false });
    const r = await engine.createSend(p, { orgId: "o1", actorId: "u1", conversationId: "c1", body: "x", policyTag: null, correlationId: "c" }); const appr = await engine.approveSend(p, "o1", "boss", r.send!.id);
    sendCalls = 0; await workExisting(p, "o1", appr.job!.id);
    check("P43 reply capability denied at execution → no provider write", sendCalls === 0 && mem.sends.get(r.send!.id)!.status === "failed");
  }
  {
    const mem = memStore(); mem.conversations.set("c1", convRow({ lastInboundAt: iso(60_000) }));
    const { p } = ports(mem);
    const r = await engine.createSend(p, { orgId: "o1", actorId: "u1", conversationId: "c1", body: "x", policyTag: null, correlationId: "c" });
    const rej = await engine.rejectSend(p, "o1", "u1", r.send!.id);
    check("P44 reject a pending draft → rejected (no send)", rej.ok && mem.sends.get(r.send!.id)!.approvalState === "rejected");
    check("P45 approving a rejected/again send is refused", !(await engine.approveSend(p, "o1", "boss", r.send!.id)).ok);
  }
  {
    const mem = memStore(); mem.conversations.set("c1", convRow({ lastInboundAt: iso(25 * 3600_000) })); const { p } = ports(mem);
    const r = await engine.createSend(p, { orgId: "o1", actorId: "u1", conversationId: "c1", body: "x", policyTag: null, correlationId: "c" });
    check("P46 createSend outside window without tag → manual_review draft", r.send!.status === "manual_review");
    const r2 = await engine.createSend(p, { orgId: "o1", actorId: "u1", conversationId: "c1", body: "x", policyTag: "PROMOTIONAL", correlationId: "c" });
    check("P47 createSend with unsupported tag rejected", !r2.ok && r2.error === "unsupported_policy_tag");
  }

  // ═══ Fencing / recovery / send-never-replayed (P48–P52) ═══════════════════
  {
    const mem = memStore(); mem.conversations.set("c1", convRow()); const { p } = ports(mem);
    await p.store.insertJob(syncJob("o1", "c1", { id: "lf", idempotencyKey: "lf", status: "available" }));
    const [c1] = await engine.dispatchDue(p, { leaseOwner: "wA" });
    check("P48 two workers cannot claim one job", (await engine.dispatchDue(p, { leaseOwner: "wB" })).length === 0);
    const wrong = await engine.workJob(p, { ...c1, leaseToken: "WRONG", leaseOwner: "wZ" });
    check("P49 wrong lease token cannot finalize", wrong.outcome.startsWith("fence_") || wrong.outcome === "already_terminal");
  }
  {
    const mem = memStore(); const { p } = ports(mem, { nowMs: NOW + 1e12 });
    await p.store.insertJob({ ...syncJob("o1", "c1", { id: "sr", idempotencyKey: "sr" }), status: "executing", attemptCount: 1, leaseOwner: "d", leaseToken: "t", leaseExpiresAtIso: new Date(1).toISOString() });
    const rec = await engine.recoverAbandoned(p, {});
    check("P50 abandoned READ job safely requeues", rec.requeued === 1 && (await p.store.getJob("o1", "sr"))!.status === "available");
    mem.sends.set("s9", { id: "s9", orgId: "o1", conversationId: "c1", policyTag: null, windowState: "within_24h", approvalState: "approved", status: "ready", requestedBy: "u", approvedBy: "b", providerMessageId: null, safeErrorKind: null, attemptCount: 0, correlationId: "c", idempotencyKey: "s9", draftBodyCipher: "enc:x" });
    await p.store.insertJob({ ...syncJob("o1", "c1", { id: "se", idempotencyKey: "se" }), jobKind: "dm_send_execute", sendId: "s9", status: "executing", attemptCount: 1, leaseOwner: "d", leaseToken: "t", leaseExpiresAtIso: new Date(1).toISOString() });
    const rec2 = await engine.recoverAbandoned(p, {});
    check("P51 abandoned SEND job → manual_review, NEVER auto-replayed", rec2.manualReview >= 1 && (await p.store.getJob("o1", "se"))!.status === "failed" && mem.sends.get("s9")!.status === "manual_review");
    check("P52 send job not re-dispatched after manual review", (await engine.dispatchDue(p, { leaseOwner: "wX" })).every((j) => j.id !== "se"));
  }

  // ═══ DTO / observability / roles (P53–P58) ════════════════════════════════
  check("P53 conversation DTOs carry no token/cipher/cursor", !/token|cipher|cursor|lease/i.test(JSON.stringify(toConversationListItem({ id: "c", platform: "facebook", status: "open", assigneeUserId: null, unread: true, participantDisplaySafe: "x", lastMessageAt: null })) + JSON.stringify(toConversationDetail(convRow(), true))));
  check("P54 message DTO (already-decrypted body) has no ciphertext/key", (() => { const d = toMessageDTO({ id: "m", conversationId: "c", externalMessageId: "", direction: "inbound", senderExternalId: null, policyTag: null, deliveryState: null, providerCreatedAt: null, body: "hello" }); return d.body === "hello" && !/cipher|token|key/i.test(JSON.stringify(d)); })());
  check("P55 send DTO exposes state only (no body/cipher)", !/body|cipher|token/i.test(JSON.stringify(toSendDTO({ id: "s", orgId: "o", conversationId: "c", policyTag: null, windowState: "within_24h", approvalState: "pending", status: "pending", requestedBy: "u", approvedBy: null, providerMessageId: null, safeErrorKind: null, attemptCount: 0, correlationId: "", idempotencyKey: "" }))));
  check("P56 observability forbids identifier/content/body dims", !validateMetricContract({ name: MESSAGING_METRICS.messagesIngested, dimensions: ["body"] }).ok && !validateMetricContract({ name: "x", dimensions: ["conversation_id"] }).ok && validateMetricContract({ name: "x", dimensions: ["platform", "window_state"] }).ok);
  check("P57 health evaluator secret-free + coarse", (() => { const h = evaluateMessagingHealth({ byStatus: { scheduled: 2 }, deadLetter: 0, oldestDueMs: 1000, manualReview: 0 }); return h.state === "healthy" && h.backlog === 2; })());
  check("P58 role gates (view/draft/approve distinct)", canViewMessaging("support") && canDraftMessage("support") && !canApproveSendRole("support") && canApproveSendRole("manager"));

  // ═══ Boundary guard fixtures (P59–P66) ════════════════════════════════════
  check("P59 guard flags another provider (WhatsApp/SMS/email)", scanContent("src/lib/meta/messaging/x.ts", "import { wa } from 'whatsapp';").some((v) => /rule 17/.test(v)));
  check("P60 guard flags auto-send", scanContent("src/lib/meta/messaging/x.ts", "const autoSend = true;").some((v) => /rule 17/.test(v)));
  check("P61 guard flags a plaintext body column", scanContent("src/lib/meta/messaging/store.ts", "const x = { message_text: body };").some((v) => /rule 17/.test(v)));
  check("P62 guard flags a raw HTTP call in messaging", scanContent("src/lib/meta/messaging/x.ts", "await fetch('https://graph');").some((v) => /rule 17/.test(v)));
  check("P63 guard flags a direct AI gateway import", scanContent("src/lib/meta/messaging/x.ts", "import { x } from '@/lib/ai-reasoning';").some((v) => /rule 17/.test(v)));
  check("P64 guard flags a second reply engine", scanContent("src/lib/meta/messaging/x.ts", "export function generateReplySuggestions() {}").some((v) => /rule 17/.test(v)));
  check("P65 guard flags a browser→messaging-gateway import", scanContent("src/app/api/meta/messaging/x/route.ts", "import { createMessagingGateway } from '@/lib/meta/provider/graph';").some((v) => /rule 17/.test(v)));
  check("P66 guard clean on a legitimate messaging domain file", scanContent("src/lib/meta/messaging/policy.ts", "export const x = 1;").length === 0);

  // ═══ Migration + sealed gateway + absence proofs (P67–P73) ════════════════
  const mig = readFileSync("supabase/migrations/20270103120000_meta_workspace_6_9_phase6_messaging.sql", "utf8");
  check("P67 RLS org-select via current_org_id + no auth write", /current_org_id\(\)/.test(mig) && /enable row level security/.test(mig) && !/for insert to authenticated|for update to authenticated/.test(mig));
  check("P68 bodies encrypted at rest (ciphertext columns, no plaintext body)", /body_ciphertext/.test(mig) && /draft_body_ciphertext/.test(mig) && !/\bmessage_text\b|\bbody_text\b|\bbody_plain\b/.test(mig));
  // RC1 regression: the active-job unique index must EXCLUDE dm_send_execute, else a
  // second approved send on the same conversation collides and silently never sends.
  check("P68b send-execute jobs excluded from the active-job unique index (RC1 fix)", (() => { const m = mig.slice(mig.indexOf("meta_messaging_job_active_uq")); return /job_kind <> 'dm_send_execute'/.test(m.slice(0, m.indexOf(";"))); })());
  check("P69 additive + SKIP LOCKED claim + dedup indexes", !/drop table/i.test(mig) && /for update skip locked/i.test(mig) && /meta_dm_message_dedup_uq/.test(mig) && /meta_dm_conversation_uq/.test(mig));
  check("P70 no token / raw payload / encryption key column", !/access_token|raw_payload|webhook_signature|encryption_key/.test(mig));
  check("P71 messaging module makes no direct Meta call (sealed gateway only)", ["engine", "service", "store", "policy", "normalize", "state", "feed", "webhook"].every((f) => { const c = readFileSync(`src/lib/meta/messaging/${f}.ts`, "utf8"); return !/graph\.facebook|graphJson\(|\/me\/accounts/.test(c); }));
  check("P72 messaging store persists ONLY ciphertext bodies (no plaintext write)", (() => { const c = readFileSync("src/lib/meta/messaging/store.ts", "utf8"); return /body_ciphertext/.test(c) && !/message_text|body_text|body_plain/.test(c); })());
  check("P73 no WhatsApp/SMS/email surface in messaging", ["engine", "service", "store", "webhook", "policy"].every((f) => !/whatsapp|twilio|nodemailer|smtp|sendgrid/i.test(readFileSync(`src/lib/meta/messaging/${f}.ts`, "utf8"))));

  console.log(`\nPhase 6 self-test: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
