// ============================================================================
// 🧠 ZONO — AI Broker Brain — strategic intent router (pure). PHASE 50.0.
// Deterministic keyword/pattern classification of a broker's strategic goal
// (Hebrew + English). No LLM, no I/O. Returns the intent, timeframe, and any
// extracted quantities (free hours, exclusive count, target city).
// ============================================================================
import type { BrokerIntent, ClassifiedGoal, Timeframe } from "./types";

interface Rule { intent: BrokerIntent; kws: string[]; weight?: number }

// Order matters only for tie-breaking display; scoring picks the max.
const RULES: Rule[] = [
  { intent: "exclusive_listings", kws: ["בלעדי", "בלעדיות", "בלעדיים", "מנדט", "exclusive", "listings", "נכסים חדשים", "החתמת", "להחתים"] },
  { intent: "free_time", kws: ["שעה פנויה", "שעות פנויות", "שעתיים", "זמן פנוי", "פנוי", "free hour", "free hours", "free time", "spare time", "יש לי זמן"] },
  { intent: "close_deal", kws: ["לסגור עסקה", "לסגור דיל", "עסקה השבוע", "לסגור השבוע", "close a deal", "close deal", "closing", "סגירת עסקה", "להגדיל סיכוי", "increase my chance", "chance of closing"] },
  { intent: "territory_domination", kws: ["לשלוט", "שולט", "שולטת", "שליטה", "שליט", "דומיננטי", "dominate", "domination", "לכבוש", "אזור", "לחזק נוכחות"] },
  { intent: "seller_risk", kws: ["מוכר בסיכון", "מוכרים בסיכון", "סיכון נטישה", "seller risk", "sellers at risk", "churn", "מוכר עוזב", "לשמר מוכר"] },
  { intent: "hot_buyer", kws: ["קונה חם", "קונים חמים", "קונים החמים", "הקונים החמים", "קונה החם", "hot buyer", "hot buyers", "buyer ready", "קונה בשל"] },
  { intent: "stale_listing", kws: ["נכס תקוע", "נכסים תקועים", "לא זז", "stale listing", "stale listings", "listing stuck", "נכס ישן", "להחיות נכס"] },
];

function extractHours(t: string): number | null {
  const m = t.match(/(\d+(?:\.\d+)?)\s*(?:שעות|שעה|hours?|hrs?)/i);
  if (m) return Math.max(0, Math.round(Number(m[1])));
  if (/שעתיים|two hours|2 hours/i.test(t)) return 2;
  if (/חצי שעה|half an hour/i.test(t)) return 1;
  return null;
}
function extractCount(t: string): number | null {
  const m = t.match(/(\d+)\s*(?:נכסים|בלעדי\w*|listings|exclusive\w*|deals?|עסקאות)/i);
  return m ? Math.max(0, parseInt(m[1], 10)) : null;
}
function extractCity(t: string): string | null {
  // "ב<city> מערב", "באזור <city>", "in <city>" — capture a short region token.
  const he = t.match(/(?:באזור|בשכונת|בשכונה|ברחוב|בעיר|לשלוט ב)\s*([^\s,.;]+(?:\s[^\s,.;]+)?)/);
  if (he && he[1]) return he[1].replace(/^ב/, "").trim();
  const en = t.match(/\bin\s+([A-Z][\w'-]+(?:\s[A-Z][\w'-]+)?)/);
  if (en && en[1]) return en[1].trim();
  return null;
}
function extractTimeframe(t: string): Timeframe {
  if (/היום|today|עכשיו|now|כרגע/i.test(t)) return /עכשיו|now|כרגע/i.test(t) ? "now" : "today";
  if (/השבוע|this week|בשבוע/i.test(t)) return "this_week";
  if (/החודש|this month|בחודש/i.test(t)) return "this_month";
  return "any";
}

/** Classify a free-text strategic goal into a BrokerIntent + extracted quantities. */
export function classifyGoal(raw: string): ClassifiedGoal {
  const t = (raw ?? "").toLowerCase();
  const matched: string[] = [];
  const scores = new Map<BrokerIntent, number>();

  for (const rule of RULES) {
    let s = 0;
    for (const kw of rule.kws) {
      if (t.includes(kw.toLowerCase())) { s += (rule.weight ?? 1); matched.push(kw); }
    }
    if (s > 0) scores.set(rule.intent, (scores.get(rule.intent) ?? 0) + s);
  }

  let intent: BrokerIntent = "general";
  let best = 0;
  for (const [i, s] of scores) if (s > best) { best = s; intent = i; }

  const hours = extractHours(t);
  // A bare "I have N hours" strongly implies the free_time intent.
  if (intent === "general" && hours != null) intent = "free_time";

  const total = matched.length;
  const confidence = intent === "general" ? (raw.trim() ? 35 : 0) : Math.min(95, 55 + best * 12 + Math.min(total, 3) * 3);

  return {
    intent,
    timeframe: extractTimeframe(t),
    hours: intent === "free_time" ? hours : null,
    count: intent === "exclusive_listings" || intent === "close_deal" ? extractCount(t) : null,
    city: intent === "territory_domination" || intent === "exclusive_listings" ? extractCity(raw ?? "") : null,
    confidence,
    matched: [...new Set(matched)],
  };
}
