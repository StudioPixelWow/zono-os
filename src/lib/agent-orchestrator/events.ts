// ============================================================================
// 🕸️ Multi-Agent Orchestrator — Event Bus + Subscriptions (pure). 29.8.
// Parts 1 + 2. Turns the agent scorecards into internal events, then routes each
// event to the agents that subscribe to it. Evidence-only.
// ============================================================================
import type { OrchestratorInput, AgentEvent, EventType, AgentId, CrossAgentReaction, Impact } from "./types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const truthOf = (t: number | null | undefined) => clamp(t ?? 50);

// ── Part 1 — derive events from the agent scorecards ────────────────────────
export function deriveEvents(input: OrchestratorInput): AgentEvent[] {
  const out: AgentEvent[] = [];
  const push = (type: EventType, source: AgentId, entityType: string, entityId: string, entityName: string, propertyId: string | null, summary: string, impact: Impact, confidence: number, truth: number, urgency: number) =>
    out.push({ id: `${type}:${entityId}`, type, source, entityType, entityId, entityName, propertyId, summary, impact, confidence: clamp(confidence), truth: truthOf(truth), urgency: clamp(urgency) });

  for (const b of input.buyers) {
    if (b.closing) push("BUYER_READY_TO_CLOSE", "buyer", "buyer", b.id, b.name, null, `${b.name} מוכן לסגירה`, "high", b.confidence, b.truth, 85);
    else if (b.hot) push("BUYER_HOT", "buyer", "buyer", b.id, b.name, b.matchListingIds[0] ?? null, `${b.name} נהיה קונה חם`, b.impact, b.confidence, b.truth, 78);
  }
  for (const s of input.sellers) {
    if (s.ready) push("SELLER_READY_TO_SIGN", "seller", "seller", s.id, s.name, s.propertyId, `${s.name} מוכן לחתימה`, "high", s.confidence, s.truth, 82);
    if (s.atRisk) push("SELLER_HIGH_CHURN", "seller", "seller", s.id, s.name, s.propertyId, `${s.name} בסיכון נטישה`, "high", s.confidence, s.truth, 80);
    if (s.priceIssue) push("PROPERTY_OVERPRICED", "seller", "seller", s.id, s.name, s.propertyId, `${s.name}: פער מחיר בנכס`, "medium", s.confidence, s.truth, 60);
  }
  for (const l of input.listings) {
    if (l.critical) push("LISTING_CRITICAL", "listing", "property", l.id, l.name, l.id, `${l.name} במצב קריטי`, "high", l.confidence, l.truth, 75);
    else if (l.stale) push("LISTING_STALE", "listing", "property", l.id, l.name, l.id, `${l.name} מתיישן`, "medium", l.confidence, l.truth, 58);
    if (l.overpriced && !l.critical) push("PROPERTY_OVERPRICED", "listing", "property", l.id, l.name, l.id, `${l.name} מתומחר יתר`, "medium", l.confidence, l.truth, 60);
  }
  for (const d of input.leads) {
    if (d.duplicate) push("LEAD_DUPLICATED", "lead", "lead", d.id, d.name, null, `${d.name}: ליד כפול`, "medium", 70, 55, 55);
  }
  const o = input.office;
  if (o) {
    if (o.missionsCompleted > 0) push("MISSION_COMPLETED", "office", "office", "office", o.name, null, `${o.missionsCompleted} משימות הושלמו`, "low", 70, 60, 30);
    for (const name of o.inactiveBrokers.slice(0, 5)) push("BROKER_INACTIVE", "office", "broker", `broker:${name}`, name, null, `${name} לא פעיל`, "medium", o.confidence, 55, 52);
    if (o.territoryChanged) push("TERRITORY_CHANGED", "office", "office", "territory", o.name, null, "זוהה שינוי טריטוריה", "medium", o.confidence, 55, 56);
    if (Math.abs(o.marketShiftPct) >= 5) push("MARKET_SHIFTED", "office", "office", "market", o.name, null, `תזוזת שוק ${o.marketShiftPct}%`, o.marketShiftPct < 0 ? "high" : "medium", o.confidence, 55, o.marketShiftPct < 0 ? 78 : 55);
  }
  return out.sort((a, b) => b.urgency - a.urgency);
}

// ── Part 2 — subscriptions: which agents care about which events ────────────
export const EVENT_SUBSCRIPTIONS: Record<EventType, AgentId[]> = {
  BUYER_HOT: ["listing", "seller", "office", "chief_of_staff"],
  BUYER_READY_TO_CLOSE: ["seller", "listing", "office", "chief_of_staff"],
  SELLER_HIGH_CHURN: ["office", "chief_of_staff", "listing"],
  SELLER_READY_TO_SIGN: ["buyer", "listing", "office", "chief_of_staff"],
  LISTING_STALE: ["buyer", "seller", "office"],
  LISTING_CRITICAL: ["seller", "office", "chief_of_staff"],
  PROPERTY_OVERPRICED: ["seller", "buyer", "office"],
  LEAD_DUPLICATED: ["lead", "office"],
  MISSION_COMPLETED: ["chief_of_staff", "office"],
  BROKER_INACTIVE: ["office", "chief_of_staff"],
  TERRITORY_CHANGED: ["office", "chief_of_staff"],
  MARKET_SHIFTED: ["office", "seller", "chief_of_staff"],
};

const REACTION: Partial<Record<EventType, Partial<Record<AgentId, string>>>> = {
  BUYER_HOT: { listing: "התאם נכסים בריאים לקונה", seller: "בדוק מוכרים מוכנים תואמים", office: "סמן הזדמנות עסקית", chief_of_staff: "עדכן תעדוף יומי" },
  BUYER_READY_TO_CLOSE: { seller: "האץ מוכר תואם לחתימה", listing: "ודא זמינות ומחיר הנכס", office: "עדיפות עסקה גבוהה", chief_of_staff: "הכנס למשימות היום" },
  SELLER_HIGH_CHURN: { office: "שקול התערבות שימור", chief_of_staff: "סיכון קריטי", listing: "בדוק תמחור/שיווק הנכס" },
  SELLER_READY_TO_SIGN: { buyer: "חבר קונים חמים תואמים", listing: "הכן את הנכס לשיווק/סגירה", office: "הזדמנות עסקה", chief_of_staff: "תעדף לחתימה" },
  LISTING_STALE: { buyer: "הצע לקונים עם התאמה", seller: "המלץ יישור/הורדת מחיר", office: "בחן כיסוי אזור" },
  LISTING_CRITICAL: { seller: "התערבות תמחור מיידית", office: "סיכון מלאי", chief_of_staff: "טפל בדחיפות" },
  PROPERTY_OVERPRICED: { seller: "המלץ הורדת מחיר", buyer: "המתן/נהל משא ומתן", office: "עדכן אסטרטגיית מלאי" },
  LEAD_DUPLICATED: { lead: "מזג/סקור כפילות", office: "נקה איכות נתונים" },
  MISSION_COMPLETED: { chief_of_staff: "עדכן זיכרון ארגוני", office: "מדוד תפוקה" },
  BROKER_INACTIVE: { office: "שקול הקצאה מחדש/ליווי", chief_of_staff: "קיבולת לא מנוצלת" },
  TERRITORY_CHANGED: { office: "עדכן אסטרטגיית טריטוריה", chief_of_staff: "עדכן תמונת שוק" },
  MARKET_SHIFTED: { office: "התאם אסטרטגיה", seller: "עדכן ציפיות מחיר", chief_of_staff: "עדכן תחזית" },
};

export function routeEvents(events: AgentEvent[]): CrossAgentReaction[] {
  const out: CrossAgentReaction[] = [];
  for (const e of events) {
    for (const sub of EVENT_SUBSCRIPTIONS[e.type] ?? []) {
      const reaction = REACTION[e.type]?.[sub] ?? "בחן השפעה על הסוכן";
      out.push({ eventId: e.id, eventType: e.type, subscriber: sub, reaction, why: e.summary });
    }
  }
  return out;
}
