// ============================================================================
// 💬 ZONO WhatsApp — Unified Inbox pure layer (client-safe). 36.0.
// The MISSING unifying read models over the EXISTING WhatsApp OS (whatsapp_*
// tables + engine). It does NOT re-score or re-detect anything — it CONSUMES the
// intelligence already computed and stored by the existing engine
// (analyzeConversation → state/intent/lead_score/urgency/next_best_action) and:
//   (1) groups conversations by CRM entity kind,
//   (2) normalizes stored signals into ONE conversation intelligence card
//       (health/intent/sentiment/urgency/risk/opportunity/reply/action/why),
//   (3) merges heterogeneous events into ONE chronological timeline.
// Pure, deterministic, evidence-only. No I/O, no side effects, no auto-send.
// ============================================================================

export type ConvKind = "buyer" | "seller" | "lead" | "property" | "customer" | "unknown";
export type Impact = "high" | "medium" | "low";

/** Lean view of one whatsapp_conversations row (mapped by the service). */
export interface WaConv {
  id: string;
  contactName: string | null;
  buyerId: string | null; sellerId: string | null; leadId: string | null; propertyId: string | null;
  assignedAgentId: string | null;
  detectedRole: string | null;
  state: string | null;            // requires_reply | hot_lead | missed_call_recovery | ...
  intent: string | null;           // buyer_intent | seller_intent | price_request | ...
  leadScore: number | null;        // 0..100 (already computed)
  urgencyScore: number | null;     // 0..100 (already computed)
  intentScore: number | null;      // 0..100 (already computed)
  unread: boolean;
  missedCall: boolean;
  needsResponse: boolean;
  lastMessage: string | null;
  lastMessageAt: string | null;
  nextBestAction: string | null;
}

export interface ConversationCard {
  health: number; healthLabel: string;
  intentLabel: string;
  sentiment: string;
  urgency: number; urgencyLabel: Impact;
  risk: string | null;
  opportunity: string | null;
  recommendedReply: string;
  recommendedAction: string;
  confidence: number;              // 0..100
  why: string[];
}

export interface InboxConversation extends WaConv {
  kind: ConvKind;
  href: string;
  entityHref: string | null;
  card: ConversationCard;
}

export interface InboxGroup { kind: ConvKind; label: string; conversations: InboxConversation[] }
export interface InboxTotals { conversations: number; unread: number; waiting: number; urgent: number; missedCall: number; opportunities: number }
export interface UnifiedInbox { groups: InboxGroup[]; totals: InboxTotals; facebookPhoneReceived?: number }

const DAY = 86_400_000;
const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));
const daysSince = (iso: string | null, now: number): number | null => {
  if (!iso) return null; const t = Date.parse(iso); return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / DAY)) : null;
};

const KIND_LABEL: Record<ConvKind, string> = {
  buyer: "קונים", seller: "מוכרים", lead: "לידים", property: "נכסים", customer: "לקוחות", unknown: "לא מזוהים",
};
const KIND_ORDER: ConvKind[] = ["lead", "buyer", "seller", "property", "customer", "unknown"];

export function classifyKind(c: WaConv): ConvKind {
  if (c.leadId) return "lead";
  if (c.buyerId) return "buyer";
  if (c.sellerId) return "seller";
  if (c.propertyId) return "property";
  if (c.detectedRole && ["buyer", "seller", "investor"].includes(c.detectedRole)) return "customer";
  return "unknown";
}

const SENTIMENT: Record<string, string> = {
  buyer_intent: "חיובי", seller_intent: "חיובי", viewing_request: "חיובי", price_request: "חיובי",
  investor_intent: "חיובי", financing: "ניטרלי", question: "ניטרלי", negotiation: "מעורב", spam: "שלילי", unknown: "לא ידוע",
};
const INTENT_LABEL: Record<string, string> = {
  buyer_intent: "כוונת קנייה", seller_intent: "כוונת מכירה", investor_intent: "משקיע", price_request: "בקשת מחיר",
  viewing_request: "בקשת צפייה", question: "שאלה", financing: "מימון", negotiation: "משא ומתן", spam: "ספאם", unknown: "לא מזוהה",
};

/** Build the single conversation intelligence card from STORED signals only. */
export function buildConversationCard(c: WaConv, now: number = Date.now()): ConversationCard {
  const why: string[] = [];
  const lead = c.leadScore ?? 0;
  const d = daysSince(c.lastMessageAt, now);

  // Health = engagement (stored lead score) blended with recency, minus friction.
  let health = 0.6 * lead + 40;
  if (d != null) { if (d <= 1) health += 15; else if (d <= 7) health += 5; else if (d >= 14) health -= 20; }
  if (c.needsResponse) health -= 10;
  if (c.missedCall) health -= 10;
  if (c.state === "hot_lead") health += 15;
  health = clamp(health);
  const healthLabel = health >= 70 ? "בריא" : health >= 45 ? "יציב" : "בסיכון";
  if (c.state === "hot_lead") why.push("שיחה חמה");
  if (d != null && d >= 14) why.push(`ללא מגע ${d} ימים`);
  if (c.needsResponse) why.push("ממתין לתשובה");

  const intentKey = c.intent ?? "unknown";
  const intentLabel = INTENT_LABEL[intentKey] ?? "לא מזוהה";
  const sentiment = SENTIMENT[intentKey] ?? "לא ידוע";

  const urgency = clamp(c.urgencyScore ?? (c.state === "hot_lead" ? 80 : c.needsResponse ? 55 : 20));
  const urgencyLabel: Impact = urgency >= 70 ? "high" : urgency >= 40 ? "medium" : "low";
  if (urgency >= 70) why.push("דחיפות גבוהה");

  let risk: string | null = null;
  if (c.state === "approval_required" || intentKey === "negotiation") risk = "משא ומתן / דורש אישור";
  else if (c.missedCall || c.state === "missed_call_recovery") risk = "שיחה שלא נענתה";
  else if (c.state === "stale" || (d != null && d >= 14)) risk = "מתקרר";
  if (risk) why.push(`סיכון: ${risk}`);

  let opportunity: string | null = null;
  if (intentKey === "buyer_intent") opportunity = "קונה פוטנציאלי";
  else if (intentKey === "seller_intent") opportunity = "מוכר פוטנציאלי";
  else if (intentKey === "investor_intent") opportunity = "משקיע";
  else if (intentKey === "price_request" || intentKey === "viewing_request") opportunity = "עניין פעיל";
  if (opportunity) why.push(`הזדמנות: ${opportunity}`);

  const recommendedReply = c.nextBestAction && c.nextBestAction.trim().length > 0
    ? c.nextBestAction
    : intentKey === "price_request" ? "השב עם טווח מחיר ונכסים מתאימים"
    : intentKey === "viewing_request" ? "הצע מועד לצפייה"
    : "השב אישית והמשך את השיחה";

  const recommendedAction =
    c.state === "requires_reply" || c.needsResponse ? "השב עכשיו" :
    c.state === "missed_call_recovery" || c.missedCall ? "חזור אליו" :
    c.state === "hot_lead" ? "תעדף לסגירה" :
    c.state === "waiting_client" ? "המתן ללקוח" : "עקוב";

  const confidence = clamp(c.intentScore ?? Math.max(lead, 40));

  return { health, healthLabel, intentLabel, sentiment, urgency, urgencyLabel, risk, opportunity, recommendedReply, recommendedAction, confidence, why };
}

const entityHrefFor = (c: WaConv): string | null =>
  c.buyerId ? `/buyers/${c.buyerId}` : c.sellerId ? `/sellers/${c.sellerId}` : c.leadId ? `/leads/${c.leadId}` : c.propertyId ? `/properties/${c.propertyId}` : null;

/** Group conversations by entity kind + compute totals. Pre-sorted by urgency. */
export function groupConversations(convs: WaConv[], now: number = Date.now()): UnifiedInbox {
  const enriched: InboxConversation[] = convs.map((c) => {
    const card = buildConversationCard(c, now);
    return { ...c, kind: classifyKind(c), href: `/whatsapp/inbox?c=${c.id}`, entityHref: entityHrefFor(c), card };
  });

  const groups: InboxGroup[] = KIND_ORDER.map((kind) => ({
    kind, label: KIND_LABEL[kind],
    conversations: enriched.filter((e) => e.kind === kind).sort((a, b) => b.card.urgency - a.card.urgency || b.card.health - a.card.health),
  })).filter((g) => g.conversations.length > 0);

  const totals: InboxTotals = {
    conversations: enriched.length,
    unread: enriched.filter((e) => e.unread).length,
    waiting: enriched.filter((e) => e.needsResponse || e.state === "requires_reply").length,
    urgent: enriched.filter((e) => e.card.urgencyLabel === "high").length,
    missedCall: enriched.filter((e) => e.missedCall).length,
    opportunities: enriched.filter((e) => e.card.opportunity != null).length,
  };
  return { groups, totals };
}

// ── Unified communication timeline ──────────────────────────────────────────

export type TimelineSource = "whatsapp" | "call" | "draft" | "meeting" | "mission" | "email" | "workflow" | "property";
export interface TimelineEvent {
  at: string;
  source: TimelineSource;
  title: string;
  detail: string | null;
  direction: "inbound" | "outbound" | null;
  icon: string;
}

/** Broker-scoped WhatsApp summary (consumed by the Broker Workspace / my). */
export interface BrokerWhatsapp {
  unread: number; waiting: number; urgent: number; today: number;
  waitingConversations: { id: string; contactName: string; reason: string; href: string; urgency: number }[];
}

const SOURCE_ICON: Record<TimelineSource, string> = {
  whatsapp: "💬", call: "📞", draft: "📝", meeting: "📅", mission: "🎯", email: "✉️", workflow: "⚙️", property: "🏠",
};

/** Merge heterogeneous events (already mapped to TimelineEvent) into one stream, newest first. */
export function mergeTimeline(events: Array<Omit<TimelineEvent, "icon">>): TimelineEvent[] {
  return [...events]
    .filter((e) => !!e.at && Number.isFinite(Date.parse(e.at)))
    .map((e) => ({ ...e, icon: SOURCE_ICON[e.source] ?? "•" }))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
