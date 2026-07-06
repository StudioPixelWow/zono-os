// ============================================================================
// 🔮 ZONO — Prediction Engine — forecaster (pure & deterministic). PHASE 52.0.
// Turns normalized signals into 9 probabilistic forecasts. No certainty theater:
// confidence is capped by data sufficiency, stale signals are flagged and
// downgrade sufficiency, and insufficient data yields a null probability with an
// explicit "what's missing" list. Nothing here executes — actions are advisory.
// ============================================================================
import {
  PREDICTION_HE,
  type Prediction, type PredictionKind, type PredictionSignals, type DataSufficiency,
  type RiskLevel, type Trend, type SignalEntity, type PredictionSubject, type PredictionAction,
} from "./types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const CAP: Record<DataSufficiency, number> = { high: 88, medium: 68, low: 45, none: 15 };
const DOWNGRADE: Record<DataSufficiency, DataSufficiency> = { high: "medium", medium: "low", low: "low", none: "none" };
const DAY = 86_400_000;

function avgScore(list: SignalEntity[]): number | null {
  const s = list.map((e) => e.score).filter((x): x is number => typeof x === "number");
  return s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null;
}
function subjectsOf(list: SignalEntity[]): PredictionSubject[] {
  return list.slice(0, 3).map((e) => ({ name: e.name, href: e.href, score: e.score }));
}
/** Are the driving signals stale (no activity in 30d)? Downgrades sufficiency. */
function staleness(list: SignalEntity[], now: number): boolean {
  const dated = list.map((e) => e.lastActivityAt).filter((x): x is string => !!x);
  if (!dated.length) return false;
  return dated.every((d) => now - new Date(d).getTime() > 30 * DAY);
}
function riskFrom(prob: number): RiskLevel { return prob >= 70 ? "high" : prob >= 45 ? "medium" : "low"; }

interface MkInput {
  kind: PredictionKind; probability: number | null; outcome: string; suff: DataSufficiency;
  trend: Trend; evidence: string[]; missing: string[]; riskLevel: RiskLevel; riskNote: string;
  action: PredictionAction | null; subjects: PredictionSubject[]; horizonDays: number;
}
function mk(i: MkInput): Prediction {
  const suff = i.suff;
  const probability = suff === "none" ? null : i.probability;
  return {
    kind: i.kind, label: PREDICTION_HE[i.kind],
    headline: `${PREDICTION_HE[i.kind]}: ${probability == null ? "נתונים לא מספיקים" : `${probability}%`}`,
    probability, outcome: i.outcome, confidence: CAP[suff], dataSufficiency: suff, trend: i.trend,
    evidence: i.evidence.slice(0, 5), missingData: i.missing, risk: { level: i.riskLevel, note: i.riskNote },
    action: i.action, subjects: i.subjects, horizonDays: i.horizonDays, expiresAt: null,
  };
}

const insufficient = (kind: PredictionKind, outcome: string, missing: string[], horizonDays: number): Prediction =>
  mk({ kind, probability: null, outcome, suff: "none", trend: "unknown", evidence: [], missing, riskLevel: "low", riskNote: "אין מספיק אותות לתחזית.", action: null, subjects: [], horizonDays });

/** Produce all 9 forecasts (always returns 9 — insufficient-data ones included). */
export function forecast(sig: PredictionSignals, now: number = Date.now()): Prediction[] {
  const out: Prediction[] = [];

  // 1. Seller churn.
  {
    const subs = sig.sellersAtRisk;
    if (!subs.length) out.push(insufficient("seller_churn", "אין אותות נטישת מוכרים כרגע.", ["נדרשים מוכרים פעילים עם היסטוריית מגע וסיכון"], 7));
    else {
      let suff: DataSufficiency = subs.some((s) => s.score != null) ? "high" : "low";
      const stale = staleness(subs, now); if (stale) suff = DOWNGRADE[suff];
      const prob = avgScore(subs) ?? 60;
      out.push(mk({
        kind: "seller_churn", probability: prob, outcome: `${subs.length} מוכרים בסיכון נטישה — פעולה מונעת מומלצת.`,
        suff, trend: prob >= 55 ? "up" : "flat",
        evidence: subs.map((s) => `${s.name}: ${s.riskLabel ?? s.reason ?? "בסיכון"}`),
        missing: stale ? ["חלק מהאותות ישנים (מעל 30 יום) — עדכן פעילות"] : suff === "high" ? [] : ["נדרשת היסטוריית מגע עדכנית"],
        riskLevel: riskFrom(prob), riskNote: "אובדן מנדט מכירה אם לא מטפלים.",
        action: { label: "שמר מוכרים בסיכון", href: "/sellers", requiresApproval: true }, subjects: subjectsOf(subs), horizonDays: 7,
      }));
    }
  }

  // 2. Buyer close probability.
  {
    const subs = sig.hotBuyers;
    if (!subs.length) out.push(insufficient("buyer_close", "אין קונים חמים מזוהים כרגע.", ["נדרשים קונים פעילים עם ציוני מוכנות"], 7));
    else {
      let suff: DataSufficiency = subs.some((s) => s.score != null) ? "high" : "low";
      const stale = staleness(subs, now); if (stale) suff = DOWNGRADE[suff];
      const prob = avgScore(subs) ?? 60;
      out.push(mk({
        kind: "buyer_close", probability: prob, outcome: `${subs.length} קונים חמים — סבירות סגירה גבוהה בפעולה מיידית.`,
        suff, trend: "up", evidence: subs.map((s) => `${s.name}: ${s.reason ?? "בשל לסגירה"}`),
        missing: stale ? ["אותות ישנים — ודא מגע עדכני"] : [], riskLevel: prob >= 70 ? "medium" : "low",
        riskNote: "סיכון לאבד את הקונה למתחרה אם אין מגע.", action: { label: "קדם קונים חמים", href: "/buyers", requiresApproval: true }, subjects: subjectsOf(subs), horizonDays: 7,
      }));
    }
  }

  // 3. Lead conversion.
  {
    const subs = sig.leadFollowUps;
    if (!subs.length) out.push(insufficient("lead_conversion", "אין לידים פעילים למעקב כרגע.", ["נדרשים לידים פתוחים עם היסטוריית מגע"], 7));
    else {
      let suff: DataSufficiency = subs.some((s) => s.score != null) ? "high" : "low";
      const stale = staleness(subs, now); if (stale) suff = DOWNGRADE[suff];
      const prob = avgScore(subs) ?? 45;
      out.push(mk({
        kind: "lead_conversion", probability: prob, outcome: `${subs.length} לידים במעקב — סבירות המרה בהתאם לטיפול.`,
        suff, trend: prob >= 55 ? "up" : "flat", evidence: subs.map((s) => `${s.name}: ${s.reason ?? "ליד פעיל"}`),
        missing: stale ? ["אותות ישנים — עדכן מגע"] : [], riskLevel: riskFrom(100 - prob), riskNote: "לידים מתקררים ללא מעקב מהיר.",
        action: { label: "טפל בלידים", href: "/social-leads", requiresApproval: true }, subjects: subjectsOf(subs), horizonDays: 7,
      }));
    }
  }

  // 4. Listing sale velocity.
  {
    const subs = sig.staleListings;
    if (!subs.length) out.push(insufficient("listing_velocity", "לא זוהו נכסים תקועים.", ["נדרש מלאי נכסים פעיל עם היסטוריית ימים-בשוק"], 14));
    else {
      const prob = clamp(70 - subs.length * 12);
      out.push(mk({
        kind: "listing_velocity", probability: prob, outcome: `${subs.length} נכסים בסיכון מכירה איטית — נדרשת החייאה.`,
        suff: "medium", trend: "down", evidence: subs.map((s) => `${s.name}: ${s.riskLabel ?? s.reason ?? "תקוע"}`),
        missing: ["נדרשת היסטוריית ימים-בשוק ומגמת פניות לחיזוי מדויק"], riskLevel: subs.length >= 3 ? "high" : "medium",
        riskNote: "נכס שנתקע מאבד ערך תפיסתי ומחיר.", action: { label: "החייאת נכסים", href: "/properties", requiresApproval: true }, subjects: subjectsOf(subs), horizonDays: 14,
      }));
    }
  }

  // 5. Campaign fatigue.
  {
    const m = sig.marketing;
    if (!m) out.push(insufficient("campaign_fatigue", "אין נתוני שיווק זמינים.", ["נדרשת היסטוריית ביצועי קמפיין (CTR / ROI / reach)"], 14));
    else {
      const prob = clamp(Math.min(85, m.commentsWaiting * 6 + (m.groupsToPublish > 10 ? 20 : 0) + (m.scheduledToday === 0 ? 25 : 0)));
      out.push(mk({
        kind: "campaign_fatigue", probability: prob, outcome: prob >= 50 ? "סימני שחיקה — רענן יצירתיות ותדירות." : "שחיקה נמוכה — המשך מעקב.",
        suff: "low", trend: prob >= 50 ? "up" : "flat",
        evidence: [`${m.commentsWaiting} תגובות ממתינות`, `${m.groupsToPublish} פוסטים בתור`, `${m.scheduledToday} מתוזמנים היום`],
        missing: ["נדרשת היסטוריית ביצועי קמפיין (CTR / ROI / reach) לחיזוי מדויק"], riskLevel: prob >= 60 ? "medium" : "low",
        riskNote: "שחיקת קריאייטיב מורידה מעורבות ולידים.", action: { label: "בדוק מרכז השיווק", href: "/marketing", requiresApproval: true }, subjects: [], horizonDays: 14,
      }));
    }
  }

  // 6. Broker overload.
  {
    const perf = sig.performance; const conv = sig.conversation;
    if (!perf && !conv) out.push(insufficient("broker_overload", "אין נתוני עומס זמינים.", ["נדרשים נתוני ביצועים ותקשורת"], 3));
    else {
      const load = clamp((conv ? conv.whatsappWaiting * 6 : 0) + (perf ? perf.weakSpots.length * 10 : 0) + (perf ? (100 - perf.followUpRatePct) * 0.3 : 0));
      out.push(mk({
        kind: "broker_overload", probability: load, outcome: load >= 60 ? "עומס גבוה — אזן משימות ומעקבים." : "עומס מנוהל.",
        suff: perf ? "medium" : "low", trend: load >= 55 ? "up" : "flat",
        evidence: [conv ? `${conv.whatsappWaiting} שיחות ממתינות` : "", perf ? `שיעור מעקב ${perf.followUpRatePct}%` : "", perf ? `${perf.weakSpots.length} נקודות תורפה` : ""].filter(Boolean),
        missing: perf ? [] : ["נדרשים נתוני ביצועים לאורך זמן"], riskLevel: riskFrom(load), riskNote: "עומס יתר פוגע בזמני תגובה ובאיכות הטיפול.",
        action: { label: "אזן עומס ביומן", href: "/calendar", requiresApproval: true }, subjects: [], horizonDays: 3,
      }));
    }
  }

  // 7. Missed follow-up risk.
  {
    const perf = sig.performance; const leads = sig.leadFollowUps;
    if (!perf && !leads.length) out.push(insufficient("missed_followup", "אין אותות מעקב זמינים.", ["נדרשים לידים/לקוחות פתוחים עם שיעור מעקב"], 3));
    else {
      const prob = perf ? clamp(100 - perf.followUpRatePct) : clamp(40 + leads.length * 10);
      out.push(mk({
        kind: "missed_followup", probability: prob, outcome: prob >= 50 ? "סיכון גבוה לפספוס מעקבים — סגור פערים היום." : "מעקב תחת שליטה.",
        suff: perf ? "high" : leads.length ? "low" : "none", trend: prob >= 55 ? "up" : "flat",
        evidence: [perf ? `שיעור מעקב ${perf.followUpRatePct}%` : "", `${leads.length} לידים פתוחים`].filter(Boolean),
        missing: perf ? [] : ["נדרש שיעור מעקב מדויק"], riskLevel: riskFrom(prob), riskNote: "פספוס מעקב = אובדן לידים ועסקאות.",
        action: { label: "סגור מעקבים פתוחים", href: "/today", requiresApproval: true }, subjects: subjectsOf(leads), horizonDays: 3,
      }));
    }
  }

  // 8. Deal close probability.
  {
    const buyers = sig.hotBuyers; const perf = sig.performance;
    if (!buyers.length && !perf) out.push(insufficient("deal_close", "אין אותות עסקה קרובה.", ["נדרשים קונים חמים ותוכנית עסקאות"], 7));
    else {
      const prob = clamp((avgScore(buyers) ?? 50) * 0.6 + Math.min(100, (perf?.conversionOpportunities ?? 0) * 15) * 0.4);
      out.push(mk({
        kind: "deal_close", probability: prob, outcome: `סבירות סגירת עסקה בטווח הקרוב לפי ${buyers.length} קונים חמים.`,
        suff: buyers.length ? "medium" : "low", trend: prob >= 55 ? "up" : "flat",
        evidence: [`${buyers.length} קונים חמים`, perf ? `${perf.conversionOpportunities} הזדמנויות המרה` : ""].filter(Boolean),
        missing: buyers.length ? [] : ["נדרשים קונים חמים עם ציוני מוכנות"], riskLevel: "medium", riskNote: "עסקה קרובה עלולה להיתקע ללא דחיפה.",
        action: { label: "דחוף עסקאות קרובות", href: "/forecast", requiresApproval: true }, subjects: subjectsOf(buyers), horizonDays: 7,
      }));
    }
  }

  // 9. Territory growth.
  {
    const t = sig.territory;
    const val = t ? (t.growth ?? t.score) : null;
    if (!t || val == null) out.push(insufficient("territory_growth", "אין נתוני טריטוריה זמינים.", ["נדרש ציון טריטוריה ומגמת צמיחה"], 30));
    else {
      out.push(mk({
        kind: "territory_growth", probability: clamp(val), outcome: val >= 55 ? "מגמת צמיחה חיובית — הגבר נוכחות." : val <= 45 ? "צמיחה מאטה — נדרשת פעולה." : "צמיחה יציבה.",
        suff: "medium", trend: val >= 55 ? "up" : val <= 45 ? "down" : "flat",
        evidence: [`ציון טריטוריה ${t.score ?? "—"}`, `מדד צמיחה ${t.growth ?? "—"}`, t.band ? `רמה: ${t.band}` : ""].filter(Boolean),
        missing: ["נדרשת סדרת זמן של נתח שוק לחיזוי מגמה מדויק"], riskLevel: val <= 45 ? "medium" : "low",
        riskNote: "אזור שמאבד מומנטום נכבש ע״י מתחרים.", action: { label: "מערכת הטריטוריה", href: "/territory", requiresApproval: true }, subjects: [], horizonDays: 30,
      }));
    }
  }

  return out;
}

/** Report counters (pure). */
export function summarizePredictions(preds: Prediction[]): { total: number; actionable: number; highConfidence: number; insufficient: number } {
  return {
    total: preds.length,
    actionable: preds.filter((p) => p.action != null && p.probability != null).length,
    highConfidence: preds.filter((p) => p.dataSufficiency === "high").length,
    insufficient: preds.filter((p) => p.dataSufficiency === "none").length,
  };
}
