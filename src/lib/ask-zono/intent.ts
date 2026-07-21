// ============================================================================
// 💬 Ask ZONO — Query Understanding (pure). 30.1. Part 1.
// Detects question type, intent, entities, timeframe, filters and priority from
// natural-language Hebrew/English. Supports light session carry-over (a follow-up
// like "and the sellers?" reuses the previous focus). Evidence-only heuristics.
// ============================================================================
import type { QueryUnderstanding, IntentType, QuestionType, DetectedEntity, Timeframe, ChatTurn } from "./types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const norm = (s: string) => s.toLowerCase().replace(/["'?!.,־–—]/g, " ").replace(/\s+/g, " ").trim();

// Intent keyword table (Hebrew + English). Order matters: first strong match wins.
const INTENTS: { intent: IntentType; type: QuestionType; kw: string[]; priority: number }[] = [
  { intent: "DAILY_PRIORITIES", type: "what_to_do", priority: 90, kw: ["what should i do", "today", "priorities", "priority", "מה לעשות", "מה עליי", "היום", "עדיפויות", "סדר יום", "focus"] },
  { intent: "SELLERS_AT_RISK", type: "which_entities", priority: 82, kw: ["seller", "sellers", "churn", "at risk", "מוכר", "מוכרים", "בסיכון", "נטישה"] },
  { intent: "BUYERS_CLOSING", type: "which_entities", priority: 82, kw: ["buyer", "buyers", "closing", "close", "ready to buy", "קונה", "קונים", "סגירה", "לסגור", "קרוב לסגירה"] },
  { intent: "LISTINGS_PRICE_REDUCTION", type: "which_entities", priority: 78, kw: ["price reduction", "reduce price", "overpriced", "listing", "listings", "stale", "הורדת מחיר", "מתומחר", "נכס", "נכסים", "מודעה", "מתיישן"] },
  { intent: "RECRUIT_LOCATION", type: "where", priority: 74, kw: ["recruit", "hire brokers", "where should i recruit", "לגייס", "גיוס", "היכן לגייס", "איפה לגייס", "מתווכים"] },
  { intent: "COMPETITION", type: "status", priority: 72, kw: ["competitor", "competition", "market share", "rivals", "מתחרה", "מתחרים", "תחרות", "נתח שוק"] },
  { intent: "VALUATION", type: "how_many", priority: 84, kw: ["valuation", "worth", "value", "price estimate", "הערכת שווי", "שווי", "שווה", "מחיר הערכה", "כמה שווה"] },
  { intent: "MISSIONS", type: "status", priority: 68, kw: ["mission", "missions", "tasks", "blocked", "waiting approval", "משימה", "משימות", "חסום", "ממתין לאישור"] },
  { intent: "LEADS", type: "which_entities", priority: 66, kw: ["lead", "leads", "duplicate", "new lead", "ליד", "לידים", "כפילות", "ליד חדש"] },
  { intent: "OPPORTUNITIES", type: "which_entities", priority: 76, kw: ["opportunity", "opportunities", "deal", "potential deal", "match", "הזדמנות", "הזדמנויות", "עסקה", "שידוך", "עסקה פוטנציאלית"] },
  // Batch 5.6H — canonical Journey questions. Deliberately NO "חסום"/"תקוע"
  // alone (those belong to MISSIONS / generic filters): a journey question must
  // name the journey. Priority beats MISSIONS so "מסעות חסומים" routes here.
  { intent: "JOURNEYS", type: "status", priority: 80, kw: ["journey", "journeys", "stalled journey", "מסע", "מסעות", "מסע לקוח", "מסעות תקועים", "שלבי מסע", "שהייה בשלב"] },
  { intent: "OFFICE_STATUS", type: "status", priority: 64, kw: ["office", "brokerage", "grow", "expansion", "inventory", "משרד", "עסק", "צמיחה", "הרחבה", "מלאי"] },
  { intent: "GENERAL_STATUS", type: "status", priority: 55, kw: ["status", "overview", "how are we", "summary", "מצב", "סקירה", "סיכום", "איך אנחנו"] },
];

const CITY_HINTS = ["תל אביב", "רמת גן", "גבעתיים", "חיפה", "ירושלים", "רחובות", "הרצליה", "נתניה", "באר שבע", "בת ים", "ראשון לציון", "פתח תקווה"];

function detectEntities(raw: string): DetectedEntity[] {
  const out: DetectedEntity[] = [];
  for (const c of CITY_HINTS) if (raw.includes(c)) out.push({ kind: "city", value: c });
  const quoted = raw.match(/["']([^"']{2,40})["']/g);
  if (quoted) for (const q of quoted) out.push({ kind: "property", value: q.replace(/["']/g, "") });
  return out;
}

function detectTimeframe(t: string): Timeframe {
  if (/today|היום|עכשיו|now/.test(t)) return "today";
  if (/this week|השבוע/.test(t)) return "this_week";
  if (/this month|החודש/.test(t)) return "this_month";
  if (/now|כרגע/.test(t)) return "now";
  return "any";
}

const FILTER_HINTS: { kw: string[]; filter: string }[] = [
  { kw: ["luxury", "יוקרה"], filter: "luxury" },
  { kw: ["commercial", "מסחרי"], filter: "commercial" },
  { kw: ["hot", "חם"], filter: "hot" },
  { kw: ["stale", "מתיישן"], filter: "stale" },
  { kw: ["critical", "קריטי"], filter: "critical" },
  { kw: ["high risk", "סיכון גבוה", "בסיכון"], filter: "at_risk" },
];

export function understandQuery(raw: string, history: ChatTurn[] = []): QueryUnderstanding {
  const t = norm(raw);
  let best: { intent: IntentType; type: QuestionType; priority: number; hits: string[]; strength: number } | null = null;

  for (const row of INTENTS) {
    const hits = row.kw.filter((k) => t.includes(norm(k)));
    if (!hits.length) continue;
    const strength = hits.length + (row.type === "what_to_do" && /today|היום|מה לעשות|what should/.test(t) ? 2 : 0);
    if (!best || strength > best.strength || (strength === best.strength && row.priority > best.priority)) best = { intent: row.intent, type: row.type, priority: row.priority, hits, strength };
  }

  // Session carry-over: a short follow-up with no intent reuses the previous one.
  let carried = false;
  if (!best && history.length) {
    const lastAssistant = [...history].reverse().find((h) => h.role === "assistant" && h.intent);
    if (lastAssistant?.intent && (t.split(" ").length <= 4 || /and|too|also|וגם|ומה|גם/.test(t))) {
      const row = INTENTS.find((r) => r.intent === lastAssistant.intent)!;
      best = { intent: row.intent, type: row.type, priority: row.priority, hits: ["carry-over"], strength: 1 };
      carried = true;
    }
  }

  const entities = detectEntities(raw);
  const timeframe = detectTimeframe(t);
  const filters = FILTER_HINTS.filter((f) => f.kw.some((k) => t.includes(norm(k)))).map((f) => f.filter);
  if (best?.intent === "SELLERS_AT_RISK" && !filters.includes("at_risk")) filters.push("at_risk");

  const intent = best?.intent ?? "UNKNOWN";
  const questionType: QuestionType = best?.type ?? "unknown";
  const confidence = intent === "UNKNOWN" ? 25 : clamp(45 + (best!.hits.length) * 15 + (carried ? -10 : 0) + entities.length * 3);
  const priority = intent === "UNKNOWN" ? 20 : clamp(best!.priority + (timeframe === "today" ? 8 : 0));

  return { raw, questionType, intent, entities, timeframe, filters, priority, confidence, matchedKeywords: best?.hits ?? [] };
}
