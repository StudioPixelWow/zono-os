// ============================================================================
// 🤖 ZONO — Batch 6.7 · AI Communication Copilot — Phase 0 SELF TEST.
// Runnable gate: `npx tsx src/lib/comm-copilot/qa.ts`.
// A) Transport-agnostic canonical read (same content, different channel →
//    identical analysis). B) Explainability envelope. C) Feedback aggregation.
// D) Source guards (canonical-only, no transport import, gateway-only, never
//    sends, feedback evaluation-only). Exits non-zero on any failure.
// ============================================================================
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Conversation, Message } from "@/lib/communication-os/types";
import { toAnalysisView } from "./normalize";
import { buildExplain, isExplained } from "./explain";
import { computeFeedbackMetrics, FEEDBACK_PURPOSE } from "./feedback";
import type { FeedbackRecord, CopilotConversationView, ConversationClassification } from "./types";
import { runCopilotPipeline } from "./pipeline";
import { analyzeConversation } from "./analyze";
import { deriveSentiment } from "./sentiment";
import { detectAttention } from "./detect";
import { recommendAction } from "./recommend";
import { deterministicHash, shouldRegenerate, buildSummaryRow, buildInsightRow, hashExtraOf, replyFreshnessHash, timelineFreshnessHash, buildReplyRows, buildMilestoneRows, memoryFreshnessHash } from "./record";
import type { RecommendedActionKind, ReplyTone } from "./types";
import { analyzeConversation as az } from "./analyze";
import { extractMemory } from "./memory-extract";
import { mergeMemory } from "./memory-merge";
import { emptyMemory } from "./memory-types";
import { buildClientMemoryRow, buildAiMemoryInputs } from "./memory-record";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const strip = (s: string) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
let passed = 0, failed = 0;
const check = (name: string, cond: boolean) => { if (cond) { passed++; console.log("  ✓ " + name); } else { failed++; console.error("  ✗ " + name); } };

console.log("\nAI Communication Copilot (6.7) Phase 0 — SELF TEST\n");

// ── Fixtures: identical content, different transport ─────────────────────────
function makeConversation(channel: "whatsapp" | "gmail"): { conv: Conversation; msgs: Message[] } {
  const conv = {
    id: `${channel}:c1`, channel, title: "לקוח",
    participants: [
      { id: "p_person", kind: "person", displayName: "דנה", handle: null, channel },
      { id: "u_broker", kind: "broker", displayName: "סוכן", handle: null, channel },
    ],
    lastActivityAt: "2026-07-20T10:05:00.000Z", unreadCount: 1,
    state: { flags: ["waiting"] },
    crmLinks: { lead: "lead_1", buyer: null, seller: null, journey: null, deal: null, property: "prop_9" },
    attachmentCount: 0,
    summary: { latestMessagePreview: "מתי אפשר לראות?", latestMessageAt: "2026-07-20T10:05:00.000Z", unread: 1, lastReplyAt: "2026-07-20T09:00:00.000Z", waiting: true, participantCount: 2 },
  } as unknown as Conversation;
  const msgs = [
    { id: `${channel}:m1`, conversationId: `${channel}:c1`, channel, direction: "inbound", authorId: "p_person", sentAt: "2026-07-20T08:00:00.000Z", preview: "שלום, מחפש דירת 4 חדרים", attachments: [], read: true },
    { id: `${channel}:m2`, conversationId: `${channel}:c1`, channel, direction: "outbound", authorId: "u_broker", sentAt: "2026-07-20T09:00:00.000Z", preview: "יש לי כמה אפשרויות", attachments: [], read: true },
    { id: `${channel}:m3`, conversationId: `${channel}:c1`, channel, direction: "inbound", authorId: "p_person", sentAt: "2026-07-20T10:05:00.000Z", preview: "מתי אפשר לראות?", attachments: [], read: false },
  ] as unknown as Message[];
  return { conv, msgs };
}

const wa = makeConversation("whatsapp");
const gm = makeConversation("gmail");
const vWa = toAnalysisView(wa.conv, wa.msgs);
const vGm = toAnalysisView(gm.conv, gm.msgs);
const analysisShape = (v: typeof vWa) => JSON.stringify({
  agentId: v.agentId, waiting: v.waiting, unread: v.unread, messageCount: v.messageCount,
  lastActivityAt: v.lastActivityAt, crmLinks: v.crmLinks,
  transcript: v.transcript.map((m) => ({ seq: m.seq, direction: m.direction, sentAt: m.sentAt, text: m.text })),
});

// ── A) Transport-agnostic read ───────────────────────────────────────────────
check("A1 same content, different transport → IDENTICAL analysis (channel-agnostic)",
  analysisShape(vWa) === analysisShape(vGm));
check("A2 transcript is ordered oldest→newest and channel-free (text/direction only)",
  vWa.transcript.length === 3 && vWa.transcript[0].text.includes("מחפש") && vWa.transcript[2].direction === "inbound");
check("A3 canonical facts carried verbatim (waiting, agent, crm links)",
  vWa.waiting === true && vWa.agentId === "u_broker" && vWa.crmLinks.lead === "lead_1" && vWa.crmLinks.property === "prop_9");
check("A4 only the ref carries the transport (analysis never depends on it)",
  vWa.conversationRef === "whatsapp:c1" && vGm.conversationRef === "gmail:c1" && vWa.transcript[0].messageRef === "whatsapp:m1");

// ── B) Explainability ────────────────────────────────────────────────────────
const goodExplain = buildExplain({ confidence: 94, reasoning: ["Price discussion detected", "Offer submitted"], evidenceMessageIds: ["whatsapp:m1", "whatsapp:m3"], deterministicSignals: ["intent:negotiation"] });
check("B1 buildExplain fills a complete envelope + clamps confidence", (() => {
  const e = buildExplain({ confidence: 140, reasoning: ["x"], deterministicSignals: ["s"] });
  return e.confidence === 100 && e.evidence.length === 0 && e.llmContribution === null && e.reasoning[0] === "x";
})());
check("B2 isExplained TRUE for a real explanation, FALSE for a black box",
  isExplained(goodExplain) === true &&
  isExplained(buildExplain({ confidence: 90, reasoning: [], deterministicSignals: [] })) === false &&
  isExplained(buildExplain({ confidence: 90, reasoning: ["why"], deterministicSignals: [] })) === false);
check("B3 LLM contribution recorded when used (deterministic reasoning retained)", (() => {
  const e = buildExplain({ confidence: 80, reasoning: ["r"], deterministicSignals: ["s"], llmContribution: { used: true, note: "reworded" } });
  return e.llmContribution?.used === true && isExplained(e);
})());
check("B4 evidence message ids captured (traceable to messages)",
  goodExplain.evidenceMessageIds.length === 2 && goodExplain.evidenceMessageIds[0] === "whatsapp:m1");

// ── C) Human feedback aggregation (evaluation-only) ─────────────────────────
const fb: FeedbackRecord[] = [
  r("reply_suggestion", "accepted"), r("reply_suggestion", "accepted"), r("reply_suggestion", "rejected"), r("reply_suggestion", "edited"),
  r("classification", "correct"), r("classification", "correct"), r("classification", "incorrect"),
  r("summary", "useful"), r("summary", "not_useful"),
  r("recommendation", "useful"),
];
function r(artifactType: FeedbackRecord["artifactType"], feedback: FeedbackRecord["feedback"]): FeedbackRecord {
  return { artifactType, feedback, artifactRef: "a", conversationRef: "whatsapp:c1", userId: "u", createdAt: "2026-07-20T00:00:00.000Z" };
}
const m = computeFeedbackMetrics(fb);
check("C1 acceptance/rejection/correction rates correct",
  m.totalReplies === 4 && m.acceptanceRate === 0.5 && m.rejectionRate === 0.25 && m.correctionRate === 0.25);
check("C2 suggestion usage = (accepted+edited)/total", m.suggestionUsage === 0.75);
check("C3 classification accuracy = correct/(correct+incorrect)", Math.abs(m.classificationAccuracy - 2 / 3) < 1e-9);
check("C4 summary + recommendation usefulness", m.summaryUsefulness === 0.5 && m.recommendationUsefulness === 1);
check("C5 empty input is safe (no divide-by-zero)", (() => { const z = computeFeedbackMetrics([]); return z.acceptanceRate === 0 && z.classificationAccuracy === 0; })());
check("C6 feedback is declared EVALUATION-ONLY (never auto-retrains)", FEEDBACK_PURPOSE === "evaluation_only");

// ── D) Source guards — architecture invariants ──────────────────────────────
const dirFiles = ["types.ts", "normalize.ts", "read.ts", "explain.ts", "feedback.ts", "index.ts"].map((f) => read(`src/lib/comm-copilot/${f}`));
const all = dirFiles.map(strip).join("\n");
check("D1 canonical-only: no frozen transport table SQL in the module",
  !/whatsapp_conversations|whatsapp_messages/.test(all));
check("D2 transport-agnostic: no transport module import",
  !/@\/lib\/whatsapp\//.test(all));
check("D3 LLM only via gateway: no direct model endpoint in the module",
  !/api\.openai\.com|api\.anthropic\.com/.test(all));
check("D4 reply artifact is approval-only (never sends)",
  read("src/lib/comm-copilot/types.ts").includes("requiresApproval: true"));
check("D5 read path goes through the canonical Communication OS provider",
  read("src/lib/comm-copilot/read.ts").includes("@/lib/communication-workspace/providers"));
check("D6 boundary guard + migration + package scripts registered",
  read("scripts/check-comm-copilot-boundaries.mjs").length > 0 &&
  read("supabase/migrations/20261115120000_comm_copilot.sql").includes("copilot_conversation_insight") &&
  read("package.json").includes("qa:comm-copilot"));
check("D7 no forbidden derived-field literal in the module",
  !/velocity_score|velocity_state|health_score|engagement_score|conversion_score|next_best_action/.test(all));

// ── E–K) PHASE 1 — conversation understanding ────────────────────────────────
const isExplained2 = isExplained;
const NOW = "2026-07-23T12:00:00.000Z";
type V = CopilotConversationView;
function view(ref: string, msgs: { d: "inbound" | "outbound"; t: string }[], crm: Partial<V["crmLinks"]> = {}, last?: string, channel = "wa"): V {
  const transcript = msgs.map((m, i) => ({ seq: i, messageRef: `${channel}:${ref}:m${i + 1}`, direction: m.d, sentAt: `2026-07-23T1${i}:00:00.000Z`, text: m.t }));
  return { conversationRef: `${channel}:${ref}`, agentId: "u_b", clientName: "דנה", waiting: msgs[msgs.length - 1].d === "inbound", unread: 1, messageCount: transcript.length, lastActivityAt: last ?? transcript[transcript.length - 1].sentAt, transcript, crmLinks: { lead: null, buyer: null, seller: null, journey: null, deal: null, property: null, ...crm } };
}

const NINE: [ConversationClassification, V][] = [
  ["new_lead", view("1", [{ d: "inbound", t: "שלום, מחפש דירה באזור" }])],
  ["active_buyer", view("2", [{ d: "inbound", t: "מחפש לקנות דירה" }, { d: "outbound", t: "יש לי אפשרויות" }, { d: "inbound", t: "מה עם משכנתא ומימון?" }], { buyer: "b1" })],
  ["active_seller", view("3", [{ d: "inbound", t: "אני רוצה למכור את הדירה שלי" }])],
  ["negotiation", view("4", [{ d: "inbound", t: "בוא נתקדם על המחיר, יש הצעה נגדית" }])],
  ["appointment", view("5", [{ d: "inbound", t: "מתי אפשר לבוא לראות את הנכס?" }])],
  ["follow_up", view("6", [{ d: "inbound", t: "טוב תודה רבה" }, { d: "outbound", t: "אעדכן אותך בהמשך השבוע" }])],
  ["document_exchange", view("7", [{ d: "inbound", t: "שלחתי לך את החוזה והמסמכים לחתימה" }])],
  ["inactive", view("8", [{ d: "inbound", t: "מחפש דירה" }], {}, "2026-07-01T12:00:00.000Z")],
  ["closed", view("9", [{ d: "inbound", t: "לא מעוניין יותר, תפסיק לפנות אליי" }])],
];

let allNine = true, allExplained = true, allDeterministic = true;
for (const [want, v] of NINE) {
  const { classification } = runCopilotPipeline(v, NOW);
  if (classification.classification !== want) { allNine = false; console.error(`    · misclassified ${want} → ${classification.classification}`); }
  if (!isExplained2(classification.explain)) allExplained = false;
  if (classification.explain.llmContribution !== null) allDeterministic = false;
}
check("E1 all 9 labels classify correctly from deterministic fixtures", allNine);
check("E2 every classification is explained (confidence + reasoning + signals)", allExplained);
check("E3 Phase 1 is deterministic-only (llmContribution === null everywhere)", allDeterministic);
check("E4 classification carries evidence message ids where signals exist", (() => {
  const neg = runCopilotPipeline(NINE[3][1], NOW).classification;
  return neg.explain.evidenceMessageIds.length > 0 && neg.explain.deterministicSignals.includes("intent:negotiation");
})());

// Summary with entities.
const richView = view("10", [{ d: "inbound", t: "מחפש דירת 4 חדרים בתל אביב בתקציב 3 מיליון" }, { d: "outbound", t: "אעדכן אותך" }], { buyer: "b1" });
const rich = runCopilotPipeline(richView, NOW);
check("F1 summary composes stage/intent/facts/next-action + per-section contributions",
  !!rich.summary.stage && !!rich.summary.intent && rich.summary.facts.length >= 2 && !!rich.summary.nextAction && rich.summary.contributions.length > 0);
check("F2 NO hallucination — every FACT has ≥1 citing message id", (() => {
  const factContribs = rich.summary.contributions.filter((c) => c.section === "facts");
  return rich.summary.facts.length === factContribs.length && factContribs.every((c) => c.evidenceMessageIds.length > 0);
})());
check("F3 unsupported fact rejection — a city said ONLY by the agent is not a client fact", (() => {
  const v = view("11", [{ d: "inbound", t: "מחפש דירה" }, { d: "outbound", t: "יש לי משהו יפה בתל אביב" }]);
  const s = runCopilotPipeline(v, NOW).summary;
  return !s.facts.some((f) => f.includes("תל אביב"));   // agent-only mention never becomes a client fact
})());
check("F4 summary is explained + deterministic", isExplained2(rich.summary.explain) && rich.summary.explain.llmContribution === null);
check("F5 every contribution names its section + signals", rich.summary.contributions.every((c) => !!c.section && c.signals.length > 0));

// Stale regeneration.
check("G1 deterministicHash is stable for identical input", (() => {
  const a = runCopilotPipeline(NINE[0][1], NOW), b = runCopilotPipeline(NINE[0][1], "2026-08-01T00:00:00.000Z");
  return deterministicHash(a.classification, a.summary) === deterministicHash(b.classification, b.summary);  // time-independent
})());
check("G2 hash CHANGES when the conversation changes", (() => {
  const a = runCopilotPipeline(NINE[0][1], NOW), b = runCopilotPipeline(NINE[3][1], NOW);
  return deterministicHash(a.classification, a.summary) !== deterministicHash(b.classification, b.summary);
})());
check("G3 shouldRegenerate skips when hash unchanged (no rewrite / no LLM), regenerates on change",
  shouldRegenerate("h1", "h1", false) === false && shouldRegenerate("h1", "h1", true) === false && shouldRegenerate("h1", "h2", false) === true);

// Transport-agnostic identity (Business vs Personal WhatsApp vs Gmail).
check("H1 identical content across transports → identical classification + summary + hash", (() => {
  const msgs: { d: "inbound" | "outbound"; t: string }[] = [{ d: "inbound", t: "בוא נתקדם על המחיר, יש הצעה נגדית" }];
  const biz = runCopilotPipeline(view("x", msgs, {}, undefined, "whatsapp"), NOW);
  const personal = runCopilotPipeline(view("x", msgs, {}, undefined, "whatsapp"), NOW);   // same channel, personal transport feeds same canonical model
  const gmail = runCopilotPipeline(view("x", msgs, {}, undefined, "gmail"), NOW);
  const sig = (r: typeof biz) => JSON.stringify({ c: r.classification.classification, s: r.summary.stage, i: r.summary.intent, n: r.summary.nextAction });
  return sig(biz) === sig(personal) && sig(biz) === sig(gmail) &&
    deterministicHash(biz.classification, biz.summary) === deterministicHash(gmail.classification, gmail.summary);
})());

// Persistence payloads.
check("I1 summary row is conversation-scoped with a deterministic uuid entity_id + contributions", (() => {
  const row = buildSummaryRow("org1", rich.summary, "whatsapp:10", NOW);
  const kp = row.key_points as { conversation_ref: string; contributions: unknown[] };
  return row.entity_type === "conversation" && /^[0-9a-f-]{36}$/.test(row.entity_id) && kp.conversation_ref === "whatsapp:10" && Array.isArray(kp.contributions) && row.next_step === rich.summary.nextAction;
})());
check("I2 insight row carries classification + deterministic hash for freshness", (() => {
  const row = buildInsightRow("org1", rich, NOW);
  const ex = row.explainability as { deterministicHash?: string };
  return row.classification === rich.classification.classification && typeof ex.deterministicHash === "string" && ex.deterministicHash.length === 40;
})());
check("I3 persistence writes ONLY the two allowed sinks (source guard)", (() => {
  const persist = read("src/lib/comm-copilot/persist.ts");
  return persist.includes("copilot_conversation_insight") && persist.includes("communication_summaries") &&
    !/whatsapp_conversations|whatsapp_messages|from\(["']journeys["']\)/.test(strip(persist));
})());

// ── J) PHASE 2 — sentiment, missing-response, next-best-action, feed ─────────
const buyerV = view("b", [{ d: "inbound", t: "מחפש לקנות דירה" }, { d: "outbound", t: "יש אפשרויות" }, { d: "inbound", t: "מה עם משכנתא?" }], { buyer: "b1" });
const closeV = view("c", [{ d: "inbound", t: "בוא נסגור, תכין חוזה" }]);
const questionV = view("q", [{ d: "inbound", t: "כמה עולה הנכס?" }]);
const oldHotV = (() => { const v = view("h", [{ d: "outbound", t: "שלחתי הצעה" }, { d: "inbound", t: "בוא נסגור, תכין חוזה" }, { d: "outbound", t: "מעולה" }], {}, "2026-07-01T12:00:00.000Z"); return v; })();

check("J1 sentiment maps to 5 buckets; high_intent from ready_to_close", (() => {
  const s = deriveSentiment(analyzeConversation(closeV, NOW));
  const buckets = new Set(["positive", "neutral", "hesitant", "frustrated", "high_intent"]);
  return s.sentiment === "high_intent" && buckets.has(s.sentiment) && isExplained2(s.explain);
})());
check("J2 unanswered_question fires when a question is left waiting", (() => {
  const flags = detectAttention(analyzeConversation(questionV, NOW));
  const f = flags.find((x) => x.kind === "unanswered_question");
  return !!f && f.evidenceMessageIds.length > 0 && f.signals.includes("intent:question");
})());
check("J3 urgent fires on ready-to-close while waiting", (() => {
  const flags = detectAttention(analyzeConversation(closeV, NOW));
  return flags.some((x) => x.kind === "urgent" && x.severity === "high");
})());
check("J4 waiting_too_long / forgotten derive from the reused risk engine", (() => {
  const flags = detectAttention(analyzeConversation(oldHotV, NOW));
  return flags.some((x) => x.kind === "waiting_too_long" || x.kind === "forgotten");
})());
check("J5 next-best-action returns a valid kind + reasoning for every classification", (() => {
  const kinds = new Set<RecommendedActionKind>(["call", "whatsapp", "meeting", "reminder", "send_property", "follow_up"]);
  return NINE.every(([, v]) => { const a = analyzeConversation(v, NOW); const c = runCopilotPipeline(v, NOW).classification; const r = recommendAction(a, c.classification); return kinds.has(r.action) && r.explain.reasoning.length > 0 && isExplained2(r.explain); });
})());
check("J6 active buyer → send_property (deterministic mapping)", (() => {
  const r = runCopilotPipeline(buyerV, NOW).recommendedAction;
  return r.action === "send_property" && isExplained2(r.explain);
})());
check("J7 sentiment + attention + recommendation explained on every artifact", (() => {
  const r = runCopilotPipeline(closeV, NOW);
  return isExplained2(r.sentiment.explain) && isExplained2(r.recommendedAction.explain) && r.attention.every((f) => f.evidenceMessageIds !== undefined && f.signals.length > 0);
})());
check("J8 transport-agnostic: sentiment/attention/action identical across channels", (() => {
  const msgs: { d: "inbound" | "outbound"; t: string }[] = [{ d: "inbound", t: "בוא נסגור, תכין חוזה" }];
  const wa = runCopilotPipeline(view("z", msgs, {}, undefined, "whatsapp"), NOW);
  const gm = runCopilotPipeline(view("z", msgs, {}, undefined, "gmail"), NOW);
  const sig = (r: typeof wa) => JSON.stringify({ s: r.sentiment.sentiment, a: r.attention.map((f) => f.kind).sort(), n: r.recommendedAction.action });
  return sig(wa) === sig(gm);
})());
check("J9 Phase-2 signals fold into the freshness hash", (() => {
  const r = runCopilotPipeline(closeV, NOW);
  const withExtra = deterministicHash(r.classification, r.summary, hashExtraOf(r));
  const without = deterministicHash(r.classification, r.summary);
  return withExtra !== without && hashExtraOf(r).action === r.recommendedAction.action;
})());
check("J10 insight row persists sentiment + recommended_action + attention", (() => {
  const r = runCopilotPipeline(closeV, NOW); const row = buildInsightRow("org1", r, NOW);
  return !!row.sentiment && !!row.recommended_action && Array.isArray(row.attention);
})());
check("J11 feed reads only the Copilot's own table (source guard)", (() => {
  const feed = read("src/lib/comm-copilot/feed.ts");
  return feed.includes("copilot_conversation_insight") && !/whatsapp_conversations|whatsapp_messages|from\(["']journeys["']\)/.test(strip(feed)) && !/@\/lib\/whatsapp\//.test(feed);
})());

// ── K) PHASE 3 — reply suggestions + timeline intelligence ───────────────────
const richMsgs: { d: "inbound" | "outbound"; t: string }[] = [
  { d: "inbound", t: "מחפש לקנות דירת 4 חדרים בתל אביב בתקציב 3 מיליון" },
  { d: "outbound", t: "הנה דירה שמתאימה, שולח לך נכס" },
  { d: "inbound", t: "מתי אפשר לבוא לראות? ומה עם משכנתא?" },
  { d: "inbound", t: "בוא נתקדם על המחיר, יש הצעה נגדית" },
];
const rp = runCopilotPipeline(view("t", richMsgs, { buyer: "b1" }), NOW);

check("K1 exactly three tones: professional, friendly, persuasive", (() => {
  const tones = rp.replies.map((r) => r.tone).sort();
  const want: ReplyTone[] = ["friendly", "persuasive", "professional"];
  return rp.replies.length === 3 && JSON.stringify(tones) === JSON.stringify(want);
})());
check("K2 approval invariant — every reply requiresApproval === true", rp.replies.every((r) => r.requiresApproval === true));
check("K3 every reply is explained + deterministic (Phase 3 has no LLM)", rp.replies.every((r) => isExplained2(r.explain) && r.explain.llmContribution === null));
check("K4 reuses Draft Studio composer (no new generation engine)", (() => {
  const src = read("src/lib/comm-copilot/reply.ts");
  return src.includes("@/lib/draft-studio/compose") && src.includes("composeBody");
})());
check("K5 reply source guard — Copilot never sends (no transport send import)", (() => {
  const src = strip(read("src/lib/comm-copilot/reply.ts"));
  return !/@\/lib\/whatsapp\/|sendMessage|sendText|personalSendAction/.test(src);
})());

check("K6 milestones detected (multiple) with chronological order", (() => {
  const t = rp.timeline;
  const ordered = t.milestones.every((m, i) => m.order === i) && t.milestones.every((m, i) => i === 0 || m.occurredAt >= t.milestones[i - 1].occurredAt);
  return t.count >= 3 && ordered;
})());
check("K7 duplicate milestone prevention — one per kind", (() => {
  const kinds = rp.milestones.map((m) => m.kind);
  return new Set(kinds).size === kinds.length;
})());
check("K8 timeline model exposes icon/color/severity/completed/order", rp.timeline.milestones.every((m) => !!m.icon && !!m.color && !!m.severity && m.completed === true && typeof m.order === "number"));
check("K9 every milestone is explained (timestamp + confidence + evidence + signals)", rp.milestones.every((m) => !!m.occurredAt && isExplained2(m.explain) && m.explain.evidenceMessageIds.length > 0));

check("K10 reply freshness: stable on identical, changes on classification/sentiment/facts change", (() => {
  const a = runCopilotPipeline(view("f1", richMsgs, { buyer: "b1" }), NOW);
  const b = runCopilotPipeline(view("f1", richMsgs, { buyer: "b1" }), NOW);
  const c = runCopilotPipeline(view("f1", [{ d: "inbound", t: "לא מעוניין יותר, תפסיק" }]), NOW);
  return replyFreshnessHash(a) === replyFreshnessHash(b) && replyFreshnessHash(a) !== replyFreshnessHash(c);
})());
check("K11 timeline freshness: changes only when the milestone set changes", (() => {
  const a = runCopilotPipeline(view("f2", richMsgs, { buyer: "b1" }), NOW);
  const b = runCopilotPipeline(view("f2", [{ d: "inbound", t: "שלום" }]), NOW);
  return timelineFreshnessHash(a) === timelineFreshnessHash(runCopilotPipeline(view("f2", richMsgs, { buyer: "b1" }), NOW)) && timelineFreshnessHash(a) !== timelineFreshnessHash(b);
})());

check("K12 transport-agnostic: identical replies + timeline across whatsapp/gmail", (() => {
  const wa = runCopilotPipeline(view("x", richMsgs, { buyer: "b1" }, undefined, "whatsapp"), NOW);
  const gm = runCopilotPipeline(view("x", richMsgs, { buyer: "b1" }, undefined, "gmail"), NOW);
  const sig = (r: typeof wa) => JSON.stringify({ replies: r.replies.map((s) => [s.tone, s.body]), milestones: r.timeline.milestones.map((m) => [m.kind, m.order]) });
  return sig(wa) === sig(gm);
})());
check("K13 persistence rows — 3 approval-gated replies + milestone rows with evidence", (() => {
  const rr = buildReplyRows("org1", "wa:t", rp);
  const mr = buildMilestoneRows("org1", "wa:t", rp);
  return rr.length === 3 && rr.every((r) => r.requires_approval === true && !!r.tone && !!r.body) &&
    mr.length === rp.milestones.length && mr.every((m) => !!m.milestone_kind && !!m.occurred_at);
})());
check("K14 Phase-3 persistence writes ONLY the two allowed sinks (source guard)", (() => {
  const p = strip(read("src/lib/comm-copilot/persist.ts"));
  return p.includes("copilot_reply_suggestion") && p.includes("copilot_timeline_milestone") &&
    !/communication_os|whatsapp_conversations|whatsapp_messages|from\(["']journeys["']\)/.test(p);
})());

// ── M) PHASE 4 — deterministic AI memory ─────────────────────────────────────
const memView = (msgs: string[], ch = "wa"): CopilotConversationView => {
  const tr = msgs.map((t, i) => ({ seq: i, messageRef: `${ch}:m${i + 1}`, direction: "inbound" as const, sentAt: `2026-07-20T1${i}:00:00.000Z`, text: t }));
  return { conversationRef: `${ch}:1`, agentId: "u", clientName: "דנה", waiting: true, unread: 1, messageCount: tr.length, lastActivityAt: tr[tr.length - 1].sentAt, transcript: tr, crmLinks: { lead: null, buyer: "b1", seller: null, journey: null, deal: null, property: null } };
};
const extractOf = (msgs: string[]) => extractMemory(az(memView(msgs), NOW));
const T1 = "2026-07-20T10:00:00.000Z", T2 = "2026-07-25T10:00:00.000Z";

check("M1 extracts the full taxonomy (personal/property/financing/behavior)", (() => {
  const e = extractOf(["אני נשוי עם 2 ילדים, מהנדס. מחפש דירת 4 חדרים בפלורנטין 3 מיליון, צריך משכנתא, מרפסת חובה, יש כלב"]);
  return !!e.scalars["personal.familyStatus"] && !!e.scalars["personal.occupation"] && !!e.scalars["personal.pets"] &&
    !!e.scalars["property.budget"] && !!e.scalars["property.rooms"] && !!e.scalars["property.balcony"] &&
    !!e.scalars["financing.financingNeeded"] && !!e.lists["property.neighborhoods"];
})());
check("M2 every memory field carries confidence + source + evidence message ids", (() => {
  const e = extractOf(["מחפש דירה בתל אביב בתקציב 3 מיליון"]);
  const b = e.scalars["property.budget"];
  return !!b && b.confidence > 0 && (b.source === "explicit" || b.source === "inferred") && b.evidenceMessageIds.length > 0;
})());
check("M3 budget evolution: explicit change pushes a new evolution point", (() => {
  let m = mergeMemory(emptyMemory(T1), extractOf(["תקציב 3 מיליון"]), T1).memory;
  m = mergeMemory(m, extractOf(["עדכון: התקציב עלה ל 3.5 מיליון"]), T2).memory;
  return m.budgetEvolution.length === 2 && m.budgetEvolution[1].amount === 3500000 && m.scalars["property.budget"].value === "3500000";
})());
check("M4 budget rule: new EXPLICIT beats old INFERRED", (() => {
  const prev = emptyMemory(T1); prev.scalars["property.budget"] = { value: "2000000", confidence: 60, source: "inferred", firstSeen: T1, lastUpdated: T1, evidenceMessageIds: ["mX"], version: 1 };
  const r = mergeMemory(prev, extractOf(["תקציב 3 מיליון"]), T2);
  return r.memory.scalars["property.budget"].value === "3000000" && r.memory.scalars["property.budget"].source === "explicit" &&
    r.changes.some((c) => c.field === "property.budget" && c.why === "explicit_over_inferred");
})());
check("M5 neighborhood: explicit accumulates (preferences never removed)", (() => {
  let m = mergeMemory(emptyMemory(T1), extractOf(["מעניין אותי פלורנטין"]), T1).memory;
  m = mergeMemory(m, extractOf(["גם רמת אביב"]), T2).memory;
  return m.lists["property.neighborhoods"].map((x) => x.value).sort().join(",") === "פלורנטין,רמת אביב";
})());
check("M6 family: latest explicit statement wins (+ contradiction tracked)", (() => {
  let m = mergeMemory(emptyMemory(T1), extractOf(["אני נשוי"]), T1).memory;
  const r = mergeMemory(m, extractOf(["התגרשתי"]), T2); m = r.memory;
  return m.scalars["personal.familyStatus"].value === "גרוש" && r.changes.some((c) => c.field === "personal.familyStatus" && c.why === "latest_explicit") && m.contradictions.some((c) => c.field === "personal.familyStatus");
})());
check("M7 mortgage change: financing_approved captured as explicit high-confidence", (() => {
  const e = extractOf(["אושרה המשכנתא"]);
  return e.scalars["financing.financingApproved"].value === "approved" && e.scalars["financing.financingApproved"].source === "explicit" && e.scalars["financing.financingApproved"].confidence >= 85;
})());
check("M8 contradictions are TRACKED (not dropped)", (() => {
  let m = mergeMemory(emptyMemory(T1), extractOf(["תקציב 3 מיליון"]), T1).memory;
  m = mergeMemory(m, extractOf(["בעצם תקציב 4 מיליון"]), T2).memory;
  return m.contradictions.some((c) => c.field === "property.budget" && c.from === "3000000" && c.to === "4000000");
})());
check("M9 confidence UPGRADE on reinforcement (same explicit value re-observed)", (() => {
  let r = mergeMemory(emptyMemory(T1), extractOf(["אני נשוי"]), T1); const c1 = r.memory.scalars["personal.familyStatus"].confidence;
  r = mergeMemory(r.memory, extractOf(["כן אני נשוי"]), T2); const c2 = r.memory.scalars["personal.familyStatus"].confidence;
  return c2 > c1 && r.changes.some((c) => c.field === "personal.familyStatus" && c.why === "upgrade");
})());
check("M10 confidence DOWNGRADE — weaker inferred conflict keeps value, lowers confidence", (() => {
  const prev = emptyMemory(T1); prev.scalars["property.budget"] = { value: "3000000", confidence: 80, source: "explicit", firstSeen: T1, lastUpdated: T1, evidenceMessageIds: ["m1"], version: 1 };
  const weaker: import("./memory-types").PartialMemory = { scalars: { "property.budget": { value: "2000000", confidence: 60, source: "inferred", evidenceMessageIds: ["mX"] } }, lists: {}, budget: 2000000 };
  const r = mergeMemory(prev, weaker, T2);
  return r.memory.scalars["property.budget"].value === "3000000" && r.memory.scalars["property.budget"].confidence < 80 && r.changes.some((c) => c.why === "downgrade");
})());
check("M11 never overwrite stronger with weaker (explicit survives inferred conflict)", (() => {
  const prev = emptyMemory(T1); prev.scalars["personal.familyStatus"] = { value: "נשוי", confidence: 85, source: "explicit", firstSeen: T1, lastUpdated: T1, evidenceMessageIds: ["m1"], version: 1 };
  const weaker: import("./memory-types").PartialMemory = { scalars: { "personal.familyStatus": { value: "רווק", confidence: 65, source: "inferred", evidenceMessageIds: ["mX"] } }, lists: {}, budget: null };
  return mergeMemory(prev, weaker, T2).memory.scalars["personal.familyStatus"].value === "נשוי";
})());
check("M12 duplicate prevention — re-merging identical facts adds no new list items", (() => {
  let m = mergeMemory(emptyMemory(T1), extractOf(["פלורנטין"]), T1).memory;
  const n1 = m.lists["property.neighborhoods"].length;
  m = mergeMemory(m, extractOf(["פלורנטין"]), T2).memory;
  return m.lists["property.neighborhoods"].length === n1;
})());
check("M13 versioning — value change bumps field + top version", (() => {
  const r1 = mergeMemory(emptyMemory(T1), extractOf(["אני נשוי"]), T1);
  const r2 = mergeMemory(r1.memory, extractOf(["התגרשתי"]), T2);
  return r2.memory.scalars["personal.familyStatus"].version === 2 && r2.memory.version > r1.memory.version;
})());
check("M14 persists ONLY through existing stores (client_memory row + ai_memory inputs)", (() => {
  const m = mergeMemory(emptyMemory(T1), extractOf(["אני נשוי, תקציב 3 מיליון בפלורנטין"]), T1).memory;
  const row = buildClientMemoryRow("org1", "buyer", "b1", m, T2);
  const inputs = buildAiMemoryInputs(m, "wa:1");
  return row.entity_type === "buyer" && !!row.preferences && Array.isArray(row.desired_neighborhoods) &&
    inputs.every((i) => i.sourceType === "conversation" && (i.confidence ?? 0) >= 80);
})());
check("M15 memory persistence is source-guarded to the two existing stores", (() => {
  const p = strip(read("src/lib/comm-copilot/memory-persist.ts"));
  return p.includes("client_memory") && p.includes("@/lib/ai-memory/service") && !/copilot_memory|create table|whatsapp_conversations/.test(p);
})());
check("M16 transport-agnostic: identical memory extraction across whatsapp/gmail", (() => {
  const msgs = ["אני נשוי עם 2 ילדים, מחפש 4 חדרים בפלורנטין 3 מיליון, צריך משכנתא"];
  const wa = extractMemory(az(memView(msgs, "whatsapp"), NOW));
  const gm = extractMemory(az(memView(msgs, "gmail"), NOW));
  const sig = (e: typeof wa) => JSON.stringify({ s: Object.entries(e.scalars).map(([k, v]) => [k, v.value]).sort(), l: Object.entries(e.lists).map(([k, v]) => [k, v.map((i) => i.value).sort()]).sort() });
  return sig(wa) === sig(gm);
})());
check("M17 memory freshness: over VALUES (reinforcement alone never rewrites)", (() => {
  const r1 = runCopilotPipeline(memView(["אני נשוי בפלורנטין 3 מיליון"]), NOW);
  const r2 = runCopilotPipeline(memView(["אני נשוי בפלורנטין 3 מיליון"]), NOW);
  const r3 = runCopilotPipeline(memView(["אני נשוי ברמת אביב 4 מיליון"]), NOW);
  return memoryFreshnessHash(r1) === memoryFreshnessHash(r2) && memoryFreshnessHash(r1) !== memoryFreshnessHash(r3);
})());

console.log(`\nAI Communication Copilot (6.7) Phase 0-4 SELF TEST: ${passed} passed, ${failed} failed`);
console.log("(LLM enrichment + UI are Phase 5; not asserted here.)\n");
if (failed > 0) process.exit(1);
