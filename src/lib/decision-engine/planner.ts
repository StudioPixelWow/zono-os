// ============================================================================
// 🗂️ Action Planner + decision rules (pure). 27.4 · Part 1/3/5/9.
// Maps normalized office signals → prioritized, evidence-cited decisions with
// concrete actions and execution readiness. Deterministic, evidence-only.
// ============================================================================
import { computePriority } from "./priority";
import type {
  Action, Decision, DecisionCategory, ExecutionReadiness, Impact, OfficeDecisionSignals,
} from "./types";

let _id = 0;
const nid = (p: string) => `${p}-${++_id}`;
function action(title: string, priority: number, impact: Impact, effort: Impact, deadlineDays: number | null, confidence: number, reason: string): Action {
  return { id: nid("act"), title, priority, expectedImpact: impact, effort, deadlineDays, confidence, reason };
}
function decision(category: DecisionCategory, title: string, priorityScore: number, exec: ExecutionReadiness, evidence: string[], why: string, actions: Action[]): Decision {
  return { id: nid("dec"), category, title, priorityScore, executionReadiness: exec, evidence, why, actions };
}

/** 0..100 business score for an office (rank + share + momentum + coverage). */
export function businessScore(sig: OfficeDecisionSignals): number {
  if (!sig.hasData) return 0;
  const rankScore = sig.totalOffices ? Math.round((1 - (sig.marketRank - 1) / sig.totalOffices) * 100) : 0;
  const shareScore = Math.min(100, sig.listingSharePct * 2);
  const momentumScore = sig.momentum === "growing" ? 80 : sig.momentum === "stable" ? 55 : 30;
  const coverageScore = Math.min(100, sig.neighborhoods * 10);
  return Math.max(0, Math.min(100, Math.round(0.3 * rankScore + 0.3 * shareScore + 0.2 * momentumScore + 0.2 * coverageScore)));
}
/** Data-completeness confidence (never overstated). */
export function aiConfidence(sig: OfficeDecisionSignals): number {
  if (!sig.hasData) return 20;
  return Math.min(100, 40 + sig.activeListings * 2 + sig.neighborhoods * 3 + sig.brokers * 2);
}

/** Build prioritized decisions for one office (evidence-only). */
export function buildOfficeDecisions(sig: OfficeDecisionSignals): Decision[] {
  _id = 0;
  const out: Decision[] = [];
  const conf = aiConfidence(sig);
  if (!sig.hasData) return out;   // no data → no fabricated recommendations

  // 1) Recruit a broker where the market grows and coverage is thin.
  const growthArea = sig.expansionOpportunities[0] ?? sig.weakAreas[0];
  if (sig.brokers <= 3 && (growthArea || sig.growthPct < 0)) {
    const areaName = "name" in (growthArea ?? {}) ? (growthArea as { name: string }).name : null;
    const ev = [
      `למשרד ${sig.brokers} מתווכים פעילים בלבד`,
      `נתח מתווכים בעיר: ${sig.brokerSharePct}%`,
      sig.fastestGrowingCompetitor ? `מתחרה ${sig.fastestGrowingCompetitor.name} צמח ${sig.fastestGrowingCompetitor.growthPct}%` : `כיסוי נוכחי ${sig.neighborhoods} שכונות`,
      areaName ? `הזדמנות באזור ${areaName}` : `מגמת מלאי ${sig.growthPct}%`,
    ];
    const pr = computePriority({ businessImpact: 75, urgency: sig.threatLevel === "high" ? 80 : 55, confidence: conf, timeSensitivity: 60, marketConditions: 65, missingAction: true });
    out.push(decision("BROKERAGE", areaName ? `גייס מתווך נוסף ל${areaName}` : "הרחב את צוות המתווכים", pr, "needs_approval", ev, "צמיחת שוק וכיסוי דל מצדיקים גיוס מתווך", [action("פתח משרת גיוס + פנייה למועמדים", pr, "high", "medium", 30, conf, ev[0])]));
  }

  // 2) Defend against a fast-growing competitor.
  if (sig.fastestGrowingCompetitor && (sig.fastestGrowingCompetitor.growthPct >= 20 || sig.threatLevel === "high")) {
    const c = sig.fastestGrowingCompetitor;
    const ev = [`מתחרה ${c.name} צמח ${c.growthPct}% ב-60 יום`, `רמת איום: ${sig.threatLevel}`, `מומנטום המשרד: ${sig.momentum}`];
    const pr = computePriority({ businessImpact: 70, urgency: 85, confidence: conf, timeSensitivity: 80, marketConditions: 60, missingAction: true });
    out.push(decision("COMPETITIVE", `עקוב והגב אחר ${c.name}`, pr, "needs_approval", ev, "מתחרה בצמיחה מהירה מאיים על נתח השוק", [action(`נטר מלאי/מודעות של ${c.name}`, pr, "high", "low", 14, conf, ev[0])]));
  }

  // 3) Expand into an opportunity area.
  for (const opp of sig.expansionOpportunities.slice(0, 2)) {
    const ev = [`${opp.reason}`, `נתח מלאי נוכחי: ${sig.listingSharePct}%`];
    const pr = computePriority({ businessImpact: 65, urgency: 50, confidence: conf, timeSensitivity: 55, marketConditions: 70, missingAction: true });
    out.push(decision("TERRITORY", `התרחב ל${opp.name}`, pr, "needs_approval", ev, "אזור עם היצע/ביקוש שבו למשרד אין נוכחות", [action(`מקד גיוס מודעות/מתווכים ב${opp.name}`, pr, "high", "medium", 45, conf, ev[0])]));
  }

  // 4) Investigate / re-energize on decline.
  if (sig.momentum === "declining" || sig.growthPct < 0) {
    const ev = [`ירידה של ${Math.abs(sig.growthPct)}% במודעות אחרונות`, `דירוג שוק #${sig.marketRank}/${sig.totalOffices}`];
    const pr = computePriority({ businessImpact: 68, urgency: 75, confidence: conf, timeSensitivity: 70, marketConditions: 45, missingAction: true });
    out.push(decision("OPERATIONS", "בדוק וטפל בירידת פעילות", pr, "needs_approval", ev, "ירידה במלאי הפעיל דורשת התערבות", [action("סקירת מתווכים לא פעילים + רענון מלאי", pr, "high", "medium", 21, conf, ev[0])]));
  }

  // 5) Luxury marketing when the office dominates luxury.
  if (sig.luxurySharePct >= 40) {
    const ev = [`נתח יוקרה: ${sig.luxurySharePct}% מהמודעות מעל ₪4M`];
    const pr = computePriority({ businessImpact: 60, urgency: 40, confidence: conf, timeSensitivity: 40, marketConditions: 70, missingAction: false });
    out.push(decision("MARKETING", "השק קמפיין יוקרה ממוקד", pr, "needs_approval", ev, "דומיננטיות יוקרה מצדיקה מיצוב שיווקי", [action("בנה קמפיין יוקרה לנכסים מעל ₪4M", pr, "medium", "medium", 30, conf, ev[0])]));
  }

  // 6) Resolve inventory attribution conflicts (operational hygiene).
  if (sig.inventoryConflicts > 0) {
    const ev = [`${sig.inventoryConflicts} התנגשויות שיוך מודעות`];
    const pr = computePriority({ businessImpact: 40, urgency: 55, confidence: conf, timeSensitivity: 50, marketConditions: 30, missingAction: true });
    out.push(decision("OPERATIONS", "פתור התנגשויות שיוך מודעות", pr, "needs_approval", ev, "התנגשויות פוגעות בדיוק המלאי", [action("בדוק ידנית את המודעות המתנגשות", pr, "low", "low", 7, conf, ev[0])]));
  }

  // 7) Reprice / refresh stagnant listings.
  if (sig.stagnantListings > 0) {
    const ev = [`${sig.stagnantListings} מודעות לא פעילות/מיושנות`];
    const pr = computePriority({ businessImpact: 55, urgency: 60, confidence: conf, timeSensitivity: 60, marketConditions: 50, missingAction: true });
    out.push(decision("PROPERTY", "רענן/תמחר מחדש מודעות תקועות", pr, "needs_approval", ev, "מודעות תקועות מפחיתות המרה", [action("סקור מודעות ישנות לתמחור/פרסום מחדש", pr, "medium", "medium", 14, conf, ev[0])]));
  }

  return out.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 10);
}
