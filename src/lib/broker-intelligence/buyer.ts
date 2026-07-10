// ============================================================================
// 🧭 ZONO — BROKER INTELLIGENCE · Area 2 · Buyer (PURE).
// NOT a matches list. For ONE buyer it answers "what should I do with this buyer
// right now?" — a single Next Best Action, evidence-based, from REAL persisted
// signals only (buyer row + buyer_intelligence_profiles + match_intelligence_
// profiles). Momentum, readiness and opportunity each contribute evidence; when
// there's no real signal it flags insufficientEvidence and says "wait / gather
// info" honestly. No fabricated urgency, no invented opportunity. Offline-testable.
// ============================================================================
import {
  type Recommendation, type Evidence, clamp100, urgencyFromScore, MIN_EVIDENCE,
} from "./types";

/** REAL signals for one buyer. Nullable = "not known" (never assumed). */
export interface BuyerSignals {
  buyerId: string;
  name: string;
  hasPreapproval: boolean;
  /** budget_min AND budget_max both set. */
  budgetComplete: boolean;
  temperature: "hot" | "warm" | "cold" | null;
  /** Days since last logged contact (last_contacted_at). Null = never / unknown. */
  lastContactedDays: number | null;
  // From buyer_intelligence_profiles (persisted, real). Null when no profile yet.
  readinessScore: number | null;      // 0..100
  engagementScore: number | null;     // 0..100
  conversionProbability: number | null; // 0..100
  daysSinceActivity: number | null;
  // From match_intelligence_profiles (persisted, real).
  openMatches: number;                 // count of active/new matches
  topMatchProbability: number | null;  // best closing_probability 0..100
  topMatchPropertyId: string | null;
}

type Action = {
  kind: "send_property" | "call_today" | "send_matches" | "request_mortgage" | "book_viewing" | "gather_info" | "nurture";
  title: string;
  action: string;
  impact: string;
  href: string | null;
};

/** Decide the single Next Best Action + score it from real evidence. Pure. */
export function scoreBuyer(s: BuyerSignals): Recommendation {
  const evidence: Evidence[] = [];
  let score = 0;

  // ── Opportunity: a strong, ready match is the highest-value action ──────────
  const strongMatch = s.topMatchProbability != null && s.topMatchProbability >= 70 && s.topMatchPropertyId;
  if (strongMatch) {
    score += 30;
    evidence.push({ label: `נכס תואם חזק (סבירות סגירה ${s.topMatchProbability}%)`, source: "matching", weight: 30 });
  } else if (s.openMatches > 0) {
    const w = Math.min(18, 6 + s.openMatches * 3);
    score += w;
    evidence.push({ label: `${s.openMatches} התאמות פתוחות במאגר`, source: "matching", weight: w });
  }

  // ── Momentum: slowing / inactive buyers need a touch before they go cold ────
  const slowing = s.daysSinceActivity != null && s.daysSinceActivity >= 14;
  if (slowing) {
    const w = s.daysSinceActivity! >= 30 ? 18 : 10;
    score += w;
    evidence.push({ label: `${s.daysSinceActivity} יום ללא פעילות — מומנטום יורד`, source: "timeline", weight: w });
  } else if (s.engagementScore != null && s.engagementScore >= 60) {
    score += 10;
    evidence.push({ label: `מעורבות גבוהה (${s.engagementScore})`, source: "activity", weight: 10 });
  }
  if (s.lastContactedDays != null && s.lastContactedDays >= 10) {
    score += 8;
    evidence.push({ label: `${s.lastContactedDays} יום מאז יצירת קשר אחרונה`, source: "crm", weight: 8 });
  }

  // ── Readiness: conversion probability + financing state ─────────────────────
  if (s.conversionProbability != null && s.conversionProbability >= 60) {
    score += 14;
    evidence.push({ label: `הסתברות המרה גבוהה (${s.conversionProbability}%)`, source: "crm", weight: 14 });
  }
  if (s.readinessScore != null && s.readinessScore >= 65 && !s.hasPreapproval) {
    score += 12;
    evidence.push({ label: `מוכנות גבוהה (${s.readinessScore}) אך ללא אישור מימון`, source: "crm", weight: 12 });
  }
  if (s.temperature === "hot") {
    score += 8;
    evidence.push({ label: "קונה חם", source: "crm", weight: 8 });
  }
  if (!s.budgetComplete) {
    evidence.push({ label: "פרטי תקציב חסרים — משפיע על איכות ההתאמה", source: "crm" });
  }

  const confidence = clamp100(score);
  const scoredEvidence = evidence.filter((e) => (e.weight ?? 0) > 0).length;
  const insufficient = scoredEvidence < MIN_EVIDENCE;

  // ── Pick the ONE next best action from the strongest real signal ────────────
  const act = pickAction(s, { strongMatch: !!strongMatch, slowing, insufficient });

  const why = insufficient
    ? "אין מספיק אותות אמת על הקונה כדי להמליץ בביטחון — השלם מידע או המתן לפעילות."
    : evidence.filter((e) => (e.weight ?? 0) > 0).slice(0, 3).map((e) => e.label).join(" · ");

  return {
    id: `buyer_${s.buyerId}`,
    area: "buyer",
    entityType: "buyer",
    entityId: s.buyerId,
    title: `${s.name} — ${act.title}`,
    why,
    evidence,
    confidence,
    urgency: urgencyFromScore(confidence),
    expectedImpact: insufficient ? "לא ניתן להעריך — אין די ראיות." : act.impact,
    suggestedAction: act.action,
    href: act.href,
    insufficientEvidence: insufficient,
  };
}

function pickAction(s: BuyerSignals, f: { strongMatch: boolean; slowing: boolean; insufficient: boolean }): Action {
  const buyerHref = `/buyers/${s.buyerId}`;
  if (f.insufficient) {
    return { kind: s.budgetComplete ? "nurture" : "gather_info", title: s.budgetComplete ? "המתן / טפח" : "השלם פרטי קונה",
      action: s.budgetComplete ? "המתן לפעילות; הרץ התאמה מחדש כשיצטברו נתונים." : "השלם תקציב והעדפות כדי לשפר התאמות.", impact: "לא ניתן להעריך.", href: buyerHref };
  }
  // Strong ready match → send that property today.
  if (f.strongMatch) {
    return { kind: "send_property", title: "שלח את הנכס התואם היום",
      action: `שלח לקונה את הנכס עם סבירות הסגירה הגבוהה ביותר וקבע צפייה.`, impact: `דחיפת עסקה — סבירות סגירה ${s.topMatchProbability}%.`,
      href: s.topMatchPropertyId ? `/properties/${s.topMatchPropertyId}` : buyerHref };
  }
  // High readiness but no financing → unblock the mortgage.
  if (s.readinessScore != null && s.readinessScore >= 65 && !s.hasPreapproval) {
    return { kind: "request_mortgage", title: "קדם אישור עקרוני למשכנתא",
      action: "בקש מהקונה להשלים אישור עקרוני — חוסם המרה למרות מוכנות גבוהה.", impact: "הסרת חסם המימון לפני שהנכס הנכון יגיע.", href: buyerHref };
  }
  // Slowing / inactive but valuable → re-engage by phone.
  if (f.slowing && (s.temperature === "hot" || s.temperature === "warm" || (s.conversionProbability ?? 0) >= 50)) {
    return { kind: "call_today", title: "התקשר היום — לפני שיתקרר",
      action: "צור קשר טלפוני יזום; המומנטום יורד וזה קונה בעל ערך.", impact: "שימור קונה חם לפני נטישה.", href: buyerHref };
  }
  // Open matches → send the fresh matches.
  if (s.openMatches > 0) {
    return { kind: "send_matches", title: `שלח ${s.openMatches} התאמות חדשות`,
      action: "שלח לקונה את ההתאמות הפתוחות המדורגות והצע צפייה.", impact: "הנעה מחדש של הקונה עם נכסים רלוונטיים.", href: buyerHref };
  }
  // Default active nurture.
  return { kind: "nurture", title: "המשך טיפוח",
    action: "עדכן העדפות והרץ התאמה מחדש; שמור על קשר.", impact: "שמירה על קונה פעיל.", href: buyerHref };
}

/** Rank buyers by business impact: sufficient first, then confidence, then
 *  conversion probability. Deterministic. */
export function rankBuyers(list: BuyerSignals[]): Recommendation[] {
  const withProb = new Map(list.map((s) => [s.buyerId, s.conversionProbability ?? 0]));
  return list
    .map(scoreBuyer)
    .sort((a, b) => {
      if (a.insufficientEvidence !== b.insufficientEvidence) return a.insufficientEvidence ? 1 : -1;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return (withProb.get(b.entityId) ?? 0) - (withProb.get(a.entityId) ?? 0);
    });
}
