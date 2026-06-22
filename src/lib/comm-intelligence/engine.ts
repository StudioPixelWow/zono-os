// ============================================================================
// ZONO — Communication Intelligence OS · Pure engine (client-safe)
// ----------------------------------------------------------------------------
// Deterministic understanding of every interaction: intent, objection,
// sentiment, entity extraction, risk + opportunity detection, and durable
// client/conversation memory merges. No I/O, no LLM, no network. Hebrew-first.
// AI may later enrich the text generators without changing these signatures.
// ============================================================================

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
export const DAY = 86_400_000;

// ── sources / channels ───────────────────────────────────────────────────────
export const SOURCE_LABELS: Record<string, string> = {
  whatsapp: "וואטסאפ", call: "שיחה", voice_note: "הודעה קולית", meeting: "פגישה",
  email: "אימייל", portal: "פורטל", website: "אתר", task: "משימה", deal: "עסקה", manual: "ידני", system: "מערכת",
};
export const SOURCE_ICONS: Record<string, string> = {
  whatsapp: "MessageCircle", call: "Bell", voice_note: "Mic", meeting: "Handshake",
  email: "Send", portal: "Eye", website: "Map", task: "Clock", deal: "Landmark", manual: "Plus", system: "Sparkles",
};

// ── intent detection ─────────────────────────────────────────────────────────
export type CommIntent = "buy" | "sell" | "invest" | "price" | "viewing" | "financing"
  | "negotiation" | "question" | "complaint" | "ready_to_close" | "disengaging" | "unknown";
export const INTENT_LABELS: Record<string, string> = {
  buy: "כוונת קנייה", sell: "כוונת מכירה", invest: "השקעה", price: "מחיר", viewing: "תיאום צפייה",
  financing: "מימון", negotiation: "משא ומתן", question: "שאלה", complaint: "תלונה",
  ready_to_close: "מוכן לסגירה", disengaging: "מתרחק", unknown: "לא ידוע",
};
export function detectIntents(text: string | null | undefined): { intent: CommIntent; score: number }[] {
  const s = (text || "").toLowerCase();
  if (!s.trim()) return [];
  const out: { intent: CommIntent; score: number }[] = [];
  const push = (intent: CommIntent, score: number, re: RegExp) => { if (re.test(s)) out.push({ intent, score }); };
  push("ready_to_close", 92, /(מוכן לחתום|בוא נסגור|נתקדם לחוזה|אני בפנים|נסכם|תכין חוזה)/);
  push("viewing", 86, /(לתאם|סיור|לראות|ביקור|צפייה|מתי אפשר לבוא)/);
  push("price", 82, /(מחיר|כמה עולה|עלות|הנחה|לסגור על)/);
  push("financing", 78, /(משכנתא|מימון|הון עצמי|ריבית|בנק)/);
  push("negotiation", 76, /(להתמקח|הצעה נגדית|נתקדם על המחיר|לרדת במחיר)/);
  push("invest", 74, /(להשקיע|תשואה|נכס להשקעה|תשואה שנתית)/);
  push("sell", 80, /(רוצה למכור|למכור את הדירה|מוכר|להעלות למכירה)/);
  push("buy", 80, /(מחפש לקנות|רוצה לקנות|מחפש דירה|מעוניין לקנות)/);
  push("complaint", 70, /(לא מרוצה|תלונה|מאוכזב|בעיה|למה לא חזרת)/);
  push("disengaging", 72, /(לא רלוונטי|לא מעוניין יותר|נדבר בעתיד|כרגע לא|תפסיק)/);
  push("question", 48, /[?]|איך|מה|האם|כמה/);
  if (!out.length) out.push({ intent: "unknown", score: 20 });
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}
export function primaryIntent(text: string | null | undefined): CommIntent {
  return detectIntents(text)[0]?.intent ?? "unknown";
}

// ── objection detection (9 types) ────────────────────────────────────────────
export type ObjectionType = "price" | "financing" | "timing" | "trust" | "competition"
  | "location" | "property_condition" | "need_to_think" | "need_to_consult";
export const OBJECTION_LABELS: Record<string, string> = {
  price: "מחיר", financing: "מימון", timing: "תזמון", trust: "אמון", competition: "תחרות",
  location: "מיקום", property_condition: "מצב הנכס", need_to_think: "צריך לחשוב", need_to_consult: "צריך להתייעץ",
};
const OBJECTION_RES: { type: ObjectionType; re: RegExp; severity: string }[] = [
  { type: "price", re: /(יקר|מעבר לתקציב|גבוה מדי|אין לי כל כך|המחיר לא)/, severity: "high" },
  { type: "financing", re: /(אין לי משכנתא|לא אושר|הון עצמי|הבנק לא|בעיה במימון)/, severity: "high" },
  { type: "timing", re: /(לא עכשיו|בעוד כמה חודשים|עוד מוקדם|נחכה|לא הזמן)/, severity: "medium" },
  { type: "trust", re: /(לא בטוח בך|לא מכיר אתכם|חשש|נכווינו בעבר|אמינות)/, severity: "high" },
  { type: "competition", re: /(סוכן אחר|תיווך אחר|מצאנו במקום אחר|מתחרה|הצעה אחרת)/, severity: "high" },
  { type: "location", re: /(רחוק מדי|לא אוהב את האזור|השכונה לא|מיקום בעייתי)/, severity: "medium" },
  { type: "property_condition", re: /(דורש שיפוץ|מצב לא טוב|ישן מדי|בעיות בנכס|רטיבות)/, severity: "medium" },
  { type: "need_to_think", re: /(צריך לחשוב|אחזור אליך|תן לי זמן|נשקול)/, severity: "low" },
  { type: "need_to_consult", re: /(אדבר עם אשתי|אתייעץ|אדבר עם בעלי|המשפחה|השותף שלי)/, severity: "low" },
];
export function detectObjections(text: string | null | undefined): { type: ObjectionType; severity: string }[] {
  const s = (text || "").toLowerCase();
  if (!s.trim()) return [];
  return OBJECTION_RES.filter((o) => o.re.test(s)).map((o) => ({ type: o.type, severity: o.severity }));
}

// ── sentiment (7 states) ─────────────────────────────────────────────────────
export type CommSentiment = "positive" | "neutral" | "negative" | "frustrated" | "excited" | "urgent" | "cold";
export const SENTIMENT_LABELS: Record<string, string> = {
  positive: "חיובי", neutral: "ניטרלי", negative: "שלילי", frustrated: "מתוסכל", excited: "נלהב", urgent: "דחוף", cold: "צונן",
};
const SENTIMENT_SCORE: Record<string, number> = { excited: 92, positive: 80, neutral: 55, urgent: 50, cold: 35, frustrated: 22, negative: 18 };
export function detectSentiment(text: string | null | undefined): { sentiment: CommSentiment; score: number } {
  const s = (text || "").toLowerCase();
  if (!s.trim()) return { sentiment: "neutral", score: 55 };
  if (/(מעולה|מושלם|אשמח מאוד|נלהב|בדיוק מה שחיפשתי|וואו)/.test(s)) return mk("excited");
  if (/(דחוף|מיד|עכשיו|חייב היום|בהול)/.test(s)) return mk("urgent");
  if (/(מאוכזב|מתוסכל|למה לא חזרת|נמאס|עצבני|חוסר תקשורת)/.test(s)) return mk("frustrated");
  if (/(לא מעוניין|לא רלוונטי|תפסיק|אל תתקשר|נדבר בעתיד)/.test(s)) return mk("cold");
  if (/(לא טוב|בעיה|לא מרוצה|גרוע|אכזבה)/.test(s)) return mk("negative");
  if (/(תודה|מצוין|נשמע טוב|בסדר גמור|אשמח)/.test(s)) return mk("positive");
  return mk("neutral");
  function mk(x: CommSentiment) { return { sentiment: x, score: SENTIMENT_SCORE[x] }; }
}

// ── entity extraction ────────────────────────────────────────────────────────
export interface ExtractedEntity { kind: string; raw: string; normalized: string; confidence: number }
const CITY_RE = /(תל אביב|רמת גן|גבעתיים|הרצליה|רעננה|כפר סבא|נתניה|חיפה|ירושלים|באר שבע|ראשון לציון|פתח תקווה|חולון|בת ים|מודיעין|אשדוד|אשקלון|רחובות|נס ציונה|הוד השרון)/g;
export function extractEntities(text: string | null | undefined): ExtractedEntity[] {
  const t = text || "";
  if (!t.trim()) return [];
  const out: ExtractedEntity[] = [];
  for (const m of t.matchAll(CITY_RE)) out.push({ kind: "city", raw: m[0], normalized: m[0], confidence: 85 });
  const budget = t.match(/(\d+(?:\.\d+)?)\s*מיליון/);
  if (budget) out.push({ kind: "budget", raw: budget[0], normalized: String(Math.round(parseFloat(budget[1]) * 1_000_000)), confidence: 80 });
  const rooms = t.match(/(\d+(?:\.\d+)?)\s*חדרים/);
  if (rooms) out.push({ kind: "rooms", raw: rooms[0], normalized: rooms[1], confidence: 82 });
  if (/(מיד|דחוף|החודש|תוך חודש)/.test(t)) out.push({ kind: "timeline", raw: "מיידי", normalized: "immediate", confidence: 70 });
  else if (/(בעוד חצי שנה|שנה הבאה|לא ממהר)/.test(t)) out.push({ kind: "timeline", raw: "ארוך", normalized: "long", confidence: 65 });
  // de-dup by kind+normalized
  const seen = new Set<string>();
  return out.filter((e) => { const k = e.kind + e.normalized; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
}

// ── commitment detection (reuses cue heuristic) ──────────────────────────────
const SELF_CUES = ["אשלח", "אחזור", "נבדוק", "אעדכן", "אתאם", "אדאג", "אברר", "אכין", "נקבע"];
const CLIENT_CUES = ["תחזור אליי", "אדבר עם", "אתייעץ", "נחשוב", "אבדוק עם", "אחליט", "אחזור אליך"];
export interface DetectedCommitment { text: string; party: "agent" | "client" }
export function detectCommitments(text: string | null | undefined): DetectedCommitment[] {
  if (!text) return [];
  const parts = text.split(/[\n.!?]+/).map((p) => p.trim()).filter(Boolean);
  const out: DetectedCommitment[] = [];
  for (const p of parts) {
    if (CLIENT_CUES.some((c) => p.includes(c))) out.push({ text: p, party: "client" });
    else if (SELF_CUES.some((c) => p.includes(c))) out.push({ text: p, party: "agent" });
  }
  return out.slice(0, 6);
}

// ── risk engine (6 types) ────────────────────────────────────────────────────
export type CommRiskType = "ghosting" | "deal_risk" | "seller_churn" | "buyer_churn" | "communication_breakdown" | "lost_opportunity";
export const RISK_LABELS: Record<string, string> = {
  ghosting: "סיכון היעלמות", deal_risk: "סיכון לעסקה", seller_churn: "נטישת מוכר", buyer_churn: "נטישת קונה",
  communication_breakdown: "כשל תקשורת", lost_opportunity: "הזדמנות אובדת",
};
export interface RiskSignals {
  entityType: string; daysSinceContact: number | null; daysSinceInbound: number | null;
  unansweredOutbound: number; brokenCommitments: number; overdueCommitments: number;
  negativeSentimentStreak: number; openObjections: number; hasActiveDeal: boolean; leadScore: number;
}
export interface ComputedRisk { type: CommRiskType; severity: string; score: number; reason: string; recommended_action: string }
export function computeRisks(s: RiskSignals): ComputedRisk[] {
  const out: ComputedRisk[] = [];
  const dsc = s.daysSinceContact ?? 999;
  if (dsc >= 7 && s.unansweredOutbound > 0) out.push({ type: "ghosting", severity: dsc >= 14 ? "high" : "medium", score: clamp(40 + dsc * 2 + s.unansweredOutbound * 6), reason: `${dsc} ימים ללא מענה, ${s.unansweredOutbound} הודעות פתוחות`, recommended_action: "פנייה רב-ערוצית קצרה ולא לוחצת" });
  if (s.hasActiveDeal && (s.brokenCommitments > 0 || s.openObjections > 0 || dsc > 5)) out.push({ type: "deal_risk", severity: s.brokenCommitments > 0 ? "high" : "medium", score: clamp(45 + s.brokenCommitments * 18 + s.openObjections * 10 + (dsc > 5 ? 12 : 0)), reason: "עסקה פעילה עם התנגדויות/התחייבויות פתוחות", recommended_action: "תאם שיחה ליישור ציפיות והסרת חסמים" });
  if (s.entityType === "seller" && (s.negativeSentimentStreak >= 2 || s.brokenCommitments > 0 || dsc > 10)) out.push({ type: "seller_churn", severity: "high", score: clamp(50 + s.negativeSentimentStreak * 12 + s.brokenCommitments * 15), reason: "סימני חוסר שביעות רצון אצל המוכר", recommended_action: "עדכון ערך + שיחת אמון יזומה" });
  if (s.entityType === "buyer" && (dsc > 10 || s.negativeSentimentStreak >= 2)) out.push({ type: "buyer_churn", severity: dsc > 21 ? "high" : "medium", score: clamp(40 + (dsc > 10 ? dsc : 0) + s.negativeSentimentStreak * 10), reason: "קונה מתקרר", recommended_action: "שלח התאמות חדשות מותאמות אישית" });
  if (s.unansweredOutbound >= 3 || (s.daysSinceInbound ?? 0) > 14) out.push({ type: "communication_breakdown", severity: "medium", score: clamp(35 + s.unansweredOutbound * 9), reason: "תקשורת חד-כיוונית", recommended_action: "שנה ערוץ ותדירות, נסה הודעה קצרה" });
  if (s.leadScore >= 70 && dsc > 7) out.push({ type: "lost_opportunity", severity: "high", score: clamp(50 + (dsc - 7) * 2), reason: "ליד איכותי מוזנח", recommended_action: "טפל מיידית — פוטנציאל גבוה" });
  return out.sort((a, b) => b.score - a.score);
}

// ── opportunity engine (6 types) ─────────────────────────────────────────────
export type CommOppType = "ready_buyer" | "ready_seller" | "pricing_opportunity" | "referral_opportunity" | "review_opportunity" | "closing_opportunity";
export const OPP_LABELS: Record<string, string> = {
  ready_buyer: "קונה מוכן", ready_seller: "מוכר מוכן", pricing_opportunity: "הזדמנות תמחור",
  referral_opportunity: "הזדמנות הפניה", review_opportunity: "הזדמנות ביקורת", closing_opportunity: "הזדמנות סגירה",
};
export interface OppSignals {
  entityType: string; positiveSentimentStreak: number; recentIntents: CommIntent[];
  daysSinceContact: number | null; openObjections: number; dealClosedRecently: boolean; engagementScore: number; leadScore: number;
}
export interface ComputedOpp { type: CommOppType; score: number; reason: string; recommended_action: string }
export function computeOpportunities(s: OppSignals): ComputedOpp[] {
  const out: ComputedOpp[] = [];
  const intents = new Set(s.recentIntents);
  const warm = (s.daysSinceContact ?? 999) <= 5;
  if (intents.has("ready_to_close") || (s.entityType === "buyer" && intents.has("viewing") && s.openObjections === 0 && warm)) out.push({ type: "closing_opportunity", score: clamp(70 + s.positiveSentimentStreak * 8), reason: "סימני מוכנות לסגירה", recommended_action: "הצע צעד סגירה קונקרטי (הצעה/חוזה)" });
  if (s.entityType === "buyer" && (intents.has("buy") || intents.has("viewing")) && s.leadScore >= 65 && s.openObjections === 0) out.push({ type: "ready_buyer", score: clamp(60 + s.leadScore * 0.3), reason: "קונה חם ללא התנגדויות פתוחות", recommended_action: "שלח 2–3 התאמות מובילות ותאם צפייה" });
  if (s.entityType === "seller" && (intents.has("sell") || s.positiveSentimentStreak >= 2)) out.push({ type: "ready_seller", score: clamp(60 + s.positiveSentimentStreak * 8), reason: "מוכר בשל לרישום/עדכון מחיר", recommended_action: "תאם פגישת רישום או עדכון אסטרטגיית מחיר" });
  if (intents.has("negotiation") || intents.has("price")) out.push({ type: "pricing_opportunity", score: 58, reason: "דיון פעיל במחיר", recommended_action: "הכן נתוני שוק תומכים למו״מ" });
  if (s.dealClosedRecently && s.positiveSentimentStreak >= 1) {
    out.push({ type: "referral_opportunity", score: 64, reason: "לקוח מרוצה אחרי סגירה", recommended_action: "בקש הפניה בזמן השיא" });
    out.push({ type: "review_opportunity", score: 60, reason: "רגע אידיאלי לבקשת ביקורת", recommended_action: "שלח בקשת ביקורת מותאמת" });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ── client memory merge (deterministic, additive) ────────────────────────────
export interface MemoryDelta {
  cities?: string[]; neighborhoods?: string[]; propertyTypes?: string[]; budget?: number | null;
  timeline?: string | null; motivations?: string[]; communicationStyle?: string | null;
}
type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;
const arr = (v: Json | undefined): string[] => Array.isArray(v) ? (v as string[]) : [];
const uniq = (a: string[]) => Array.from(new Set(a.filter(Boolean))).slice(0, 25);
export interface ClientMemoryState {
  desired_cities: Json; desired_neighborhoods: Json; property_types: Json; motivations: Json;
  budget: Json; budget_evolution: Json; timeline: string | null; communication_style: string | null;
}
export function mergeClientMemory(prev: ClientMemoryState, d: MemoryDelta, nowIso: string): ClientMemoryState {
  const cities = uniq([...arr(prev.desired_cities), ...(d.cities ?? [])]);
  const neighborhoods = uniq([...arr(prev.desired_neighborhoods), ...(d.neighborhoods ?? [])]);
  const propertyTypes = uniq([...arr(prev.property_types), ...(d.propertyTypes ?? [])]);
  const motivations = uniq([...arr(prev.motivations), ...(d.motivations ?? [])]);
  let budget = prev.budget;
  const evolution = Array.isArray(prev.budget_evolution) ? [...(prev.budget_evolution as unknown[])] : [];
  if (d.budget != null) {
    const prevBudget = prev.budget && typeof prev.budget === "object" ? (prev.budget as { amount?: number }).amount : null;
    if (prevBudget !== d.budget) evolution.push({ amount: d.budget, at: nowIso });
    budget = { amount: d.budget } as Json;
  }
  return {
    desired_cities: cities, desired_neighborhoods: neighborhoods, property_types: propertyTypes, motivations,
    budget, budget_evolution: evolution.slice(-20) as Json,
    timeline: d.timeline ?? prev.timeline, communication_style: d.communicationStyle ?? prev.communication_style,
  };
}

// ── conversation engagement classification ───────────────────────────────────
export function classifyEngagement(daysSinceInbound: number | null, inboundCount: number, sentimentScore: number): "engaged" | "neutral" | "disengaged" {
  if (daysSinceInbound != null && daysSinceInbound <= 3 && inboundCount > 0 && sentimentScore >= 50) return "engaged";
  if (daysSinceInbound == null || daysSinceInbound > 14 || sentimentScore < 35) return "disengaged";
  return "neutral";
}

// ── agent-AI deterministic answers ───────────────────────────────────────────
export interface AgentAIInput {
  entityLabel: string; lastSummary: string | null; whatChanged: string | null;
  topRisk: { label: string; action: string } | null; topOpp: { label: string; action: string } | null;
  openObjections: { label: string }[]; brokenCommitments: number; nextStep: string | null;
}
export function agentAIAnswers(i: AgentAIInput): { whatHappened: string; whatChanged: string; whatNext: string; whatBlocks: string } {
  const whatHappened = i.lastSummary ?? `אין סיכום זמין עבור ${i.entityLabel} עדיין.`;
  const whatChanged = i.whatChanged ?? "אין שינוי מהותי מאז העדכון האחרון.";
  const next = i.topOpp ? `${i.topOpp.action} (${i.topOpp.label})` : i.nextStep ?? (i.topRisk ? i.topRisk.action : "המשך קשר שוטף ועדכן בהתקדמות");
  const whatNext = next;
  const blockers: string[] = [];
  if (i.brokenCommitments > 0) blockers.push(`${i.brokenCommitments} התחייבויות שנשברו`);
  if (i.openObjections.length) blockers.push(`התנגדויות פתוחות: ${i.openObjections.map((o) => o.label).join(", ")}`);
  if (i.topRisk) blockers.push(i.topRisk.label);
  const whatBlocks = blockers.length ? blockers.join(" · ") : "אין חסמים פעילים.";
  return { whatHappened, whatChanged, whatNext, whatBlocks };
}
