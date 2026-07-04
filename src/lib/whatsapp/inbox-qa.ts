// ============================================================================
// ✅ ZONO WhatsApp Unified Inbox — pure self-tests (offline). 36.0.
// Validates grouping, the conversation intelligence card, and timeline merge.
// No I/O. Runnable via the /tmp harness.
// ============================================================================
import { classifyKind, buildConversationCard, groupConversations, mergeTimeline, type WaConv } from "./inbox";

export interface WICheck { name: string; pass: boolean; detail: string }
export interface WISelfCheck { ok: boolean; total: number; passed: number; checks: WICheck[] }

const DAY = 86_400_000;
const NOW = Date.parse("2026-07-04T09:00:00.000Z");
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();

const conv = (o: Partial<WaConv> = {}): WaConv => ({
  id: "c1", contactName: "דני", buyerId: null, sellerId: null, leadId: null, propertyId: null, assignedAgentId: null,
  detectedRole: null, state: null, intent: null, leadScore: 50, urgencyScore: 30, intentScore: 60,
  unread: false, missedCall: false, needsResponse: false, lastMessage: "שלום", lastMessageAt: ago(1), nextBestAction: null, ...o,
});

export function runInboxSelfCheck(): WISelfCheck {
  const checks: WICheck[] = [];
  const add = (n: string, p: boolean, d = "") => checks.push({ name: n, pass: p, detail: d });

  add("classifyKind: lead fk wins", classifyKind(conv({ leadId: "l1", buyerId: "b1" })) === "lead");
  add("classifyKind: buyer", classifyKind(conv({ buyerId: "b1" })) === "buyer");
  add("classifyKind: seller", classifyKind(conv({ sellerId: "s1" })) === "seller");
  add("classifyKind: property-only", classifyKind(conv({ propertyId: "p1" })) === "property");
  add("classifyKind: detected role → customer", classifyKind(conv({ detectedRole: "buyer" })) === "customer");
  add("classifyKind: unknown", classifyKind(conv({})) === "unknown");

  const hot = buildConversationCard(conv({ state: "hot_lead", intent: "buyer_intent", urgencyScore: 85, leadScore: 80, needsResponse: true, nextBestAction: "התקשר עכשיו" }), NOW);
  add("card: hot → high urgency + opportunity", hot.urgencyLabel === "high" && hot.opportunity === "קונה פוטנציאלי");
  add("card: recommendedReply uses next_best_action", hot.recommendedReply === "התקשר עכשיו");
  add("card: recommendedAction respond when needsResponse", hot.recommendedAction === "השב עכשיו");
  add("card: intent + sentiment mapped", hot.intentLabel === "כוונת קנייה" && hot.sentiment === "חיובי");
  add("card: WHY non-empty with evidence", hot.why.length > 0);
  add("card: confidence 0..100", hot.confidence >= 0 && hot.confidence <= 100);

  const stale = buildConversationCard(conv({ lastMessageAt: ago(30), leadScore: 40 }), NOW);
  add("card: stale lowers health + flags risk", stale.health < 60 && stale.risk === "מתקרר");

  const missed = buildConversationCard(conv({ missedCall: true, state: "missed_call_recovery" }), NOW);
  add("card: missed call → call-back action + risk", missed.recommendedAction === "חזור אליו" && missed.risk === "שיחה שלא נענתה");

  const inbox = groupConversations([
    conv({ id: "a", leadId: "l1", unread: true, needsResponse: true, urgencyScore: 90, intent: "buyer_intent" }),
    conv({ id: "b", buyerId: "b1", urgencyScore: 20 }),
    conv({ id: "c", missedCall: true }),
  ], NOW);
  add("group: buckets by kind", inbox.groups.some((g) => g.kind === "lead") && inbox.groups.some((g) => g.kind === "buyer"));
  add("group: totals computed", inbox.totals.conversations === 3 && inbox.totals.unread === 1 && inbox.totals.waiting === 1 && inbox.totals.urgent === 1 && inbox.totals.missedCall === 1);
  add("group: lead group sorted by urgency", inbox.groups.find((g) => g.kind === "lead")!.conversations[0].id === "a");
  add("group: opportunities counted", inbox.totals.opportunities >= 1);

  const tl = mergeTimeline([
    { at: ago(2), source: "whatsapp", title: "הודעה", detail: null, direction: "inbound" },
    { at: ago(0.5), source: "meeting", title: "פגישה", detail: null, direction: null },
    { at: "bad-date", source: "call", title: "שיחה", detail: null, direction: null },
  ]);
  add("timeline: newest first + invalid dropped + icon", tl.length === 2 && tl[0].source === "meeting" && tl[0].icon === "📅");

  const empty = groupConversations([], NOW);
  add("empty-safe", empty.groups.length === 0 && empty.totals.conversations === 0 && mergeTimeline([]).length === 0);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
