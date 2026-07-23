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
import { deterministicHash, shouldRegenerate, buildSummaryRow, buildInsightRow } from "./record";

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
  return { conversationRef: `${channel}:${ref}`, agentId: "u_b", waiting: msgs[msgs.length - 1].d === "inbound", unread: 1, messageCount: transcript.length, lastActivityAt: last ?? transcript[transcript.length - 1].sentAt, transcript, crmLinks: { lead: null, buyer: null, seller: null, journey: null, deal: null, property: null, ...crm } };
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
  const a = analyzeConversation(richView, NOW);
  const row = buildInsightRow("org1", a, rich.classification, rich.summary, NOW);
  const ex = row.explainability as { deterministicHash?: string };
  return row.classification === rich.classification.classification && typeof ex.deterministicHash === "string" && ex.deterministicHash.length === 40;
})());
check("I3 persistence writes ONLY the two allowed sinks (source guard)", (() => {
  const persist = read("src/lib/comm-copilot/persist.ts");
  return persist.includes("copilot_conversation_insight") && persist.includes("communication_summaries") &&
    !/whatsapp_conversations|whatsapp_messages|from\(["']journeys["']\)/.test(strip(persist));
})());

console.log(`\nAI Communication Copilot (6.7) Phase 0+1 SELF TEST: ${passed} passed, ${failed} failed`);
console.log("(Sentiment/NBA/timeline/memory + LLM enrichment are Phase 2+; not asserted here.)\n");
if (failed > 0) process.exit(1);
