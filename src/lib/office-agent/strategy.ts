// ============================================================================
// 🏢 Office Growth Agent — Strategy + Playbook engine (pure). 29.7. Parts 4 + 7.
// Explainable office strategy (9 types) with an ordered playbook, ROI, expected
// result, approvals, mission mapping, timeline, alternatives and change detection.
// Strategy/expansion produce approval-gated proposals. Evidence-only.
// ============================================================================
import { clamp } from "./health";
import type { OfficeSignals, OfficeHealth, InventoryFinding, BrokerFinding, CompetitiveFinding, OfficeStrategy, OfficeStrategyType, PlaybookStep, Impact, StrategyChange } from "./types";

const HIGH_INVEST: OfficeStrategyType[] = ["GROW_TERRITORY", "RECRUIT_BROKERS", "LUXURY_EXPANSION", "COMMERCIAL_EXPANSION"];
interface Cand { s: OfficeStrategyType; score: number; why: string[] }
const ratio = (a: number, b: number): number => (b > 0 ? a / b : 0);

// Ordered playbooks (mission mapping) per recommended strategy (Part 7).
const STEPS: Record<OfficeStrategyType, { action: string; missionType: string; durationDays: number }[]> = {
  GROW_TERRITORY: [{ action: "מפה אזורים חלשים/מתפתחים", missionType: "OFFICE_TERRITORY_PLAN", durationDays: 7 }, { action: "גייס מלאי באזורי היעד", missionType: "OFFICE_ACQUIRE_INVENTORY", durationDays: 30 }, { action: "השק שיווק מקומי", missionType: "OFFICE_MARKETING_CAMPAIGN", durationDays: 21 }],
  RECRUIT_BROKERS: [{ action: "הגדר פרופיל גיוס ויעד", missionType: "OFFICE_RECRUIT_PLAN", durationDays: 7 }, { action: "פנה למועמדים/מתחרים נחלשים", missionType: "OFFICE_RECRUIT", durationDays: 45 }, { action: "קלוט והכשר", missionType: "OFFICE_TRAINING", durationDays: 30 }],
  ACQUIRE_INVENTORY: [{ action: "זהה בעלי נכסים באזורי חוסר", missionType: "OFFICE_ACQUIRE_INVENTORY", durationDays: 14 }, { action: "הפעל קמפיין רישום", missionType: "OFFICE_MARKETING_CAMPAIGN", durationDays: 21 }],
  IMPROVE_CONVERSION: [{ action: "נתח צווארי בקבוק במשפך", missionType: "OFFICE_PIPELINE_REVIEW", durationDays: 5 }, { action: "הדרכת המרה/סגירה", missionType: "OFFICE_TRAINING", durationDays: 21 }, { action: "הקצה לידים חמים לפנויים", missionType: "OFFICE_REALLOCATE", durationDays: 7 }],
  STRENGTHEN_MARKETING: [{ action: "בנה תוכנית שיווק לאזורים חזקים", missionType: "OFFICE_MARKETING_CAMPAIGN", durationDays: 14 }, { action: "מדוד ואפטם", missionType: "OFFICE_PIPELINE_REVIEW", durationDays: 30 }],
  LUXURY_EXPANSION: [{ action: "מפה ביקוש יוקרה", missionType: "OFFICE_TERRITORY_PLAN", durationDays: 10 }, { action: "גייס מלאי יוקרה", missionType: "OFFICE_ACQUIRE_INVENTORY", durationDays: 45 }, { action: "מתג ושווק פרימיום", missionType: "OFFICE_MARKETING_CAMPAIGN", durationDays: 30 }],
  COMMERCIAL_EXPANSION: [{ action: "העריך פוטנציאל מסחרי", missionType: "OFFICE_TERRITORY_PLAN", durationDays: 10 }, { action: "גייס מלאי מסחרי + מומחיות", missionType: "OFFICE_ACQUIRE_INVENTORY", durationDays: 60 }],
  DEFEND_TERRITORY: [{ action: "חזק קשרי בעלי נכסים באזורי הליבה", missionType: "OFFICE_RETENTION", durationDays: 14 }, { action: "בַּדֵּל מול מתחרים צומחים", missionType: "OFFICE_MARKETING_CAMPAIGN", durationDays: 21 }],
  COST_OPTIMIZATION: [{ action: "אתר קיבולת/מלאי לא יעילים", missionType: "OFFICE_PIPELINE_REVIEW", durationDays: 7 }, { action: "הקצה מחדש משאבים", missionType: "OFFICE_REALLOCATE", durationDays: 14 }],
};
const RESULT: Record<OfficeStrategyType, string> = {
  GROW_TERRITORY: "נתח שוק ומלאי גדלים", RECRUIT_BROKERS: "קיבולת והמרה גדלות", ACQUIRE_INVENTORY: "מלאי פעיל גדל", IMPROVE_CONVERSION: "יותר סגירות מאותו משפך",
  STRENGTHEN_MARKETING: "יותר לידים ורישומים", LUXURY_EXPANSION: "כניסה לפלח שולי-רווח גבוה", COMMERCIAL_EXPANSION: "פלח מסחרי חדש", DEFEND_TERRITORY: "שמירת נתח שוק", COST_OPTIMIZATION: "יעילות תפעולית גבוהה",
};
const APPROVALS: Partial<Record<OfficeStrategyType, string[]>> = {
  GROW_TERRITORY: ["מנהל משרד"], RECRUIT_BROKERS: ["מנהל משרד"], LUXURY_EXPANSION: ["מנהל משרד"], COMMERCIAL_EXPANSION: ["מנהל משרד"], ACQUIRE_INVENTORY: ["מנהל משרד"],
};

function inferCurrent(sig: OfficeSignals): OfficeStrategyType {
  if (sig.competitive.inventoryTrendPct < -5) return "DEFEND_TERRITORY";
  if (ratio(sig.activeListings, Math.max(1, sig.brokers)) > 10) return "RECRUIT_BROKERS";
  if (sig.listingPipeline.total > 0 && sig.businessScore >= 60) return "GROW_TERRITORY";
  return "IMPROVE_CONVERSION";
}

export function computeOfficeStrategy(
  sig: OfficeSignals, h: OfficeHealth, inv: InventoryFinding[], brokers: BrokerFinding[], comp: CompetitiveFinding[],
): OfficeStrategy {
  const perBroker = ratio(sig.activeListings, Math.max(1, sig.brokers));
  const has = <T extends { type: string }>(xs: T[], t: string) => xs.some((x) => x.type === t);
  const cand: Cand[] = [];

  // Defensive first — losing share.
  if (has(comp, "lost_market_share") || sig.competitive.inventoryTrendPct < -8) cand.push({ s: "DEFEND_TERRITORY", score: 86, why: ["אובדן נתח שוק — הגן על הליבה"] });
  if (has(comp, "growing_competitor") && sig.competitive.topOfficeSharePct < 25) cand.push({ s: "DEFEND_TERRITORY", score: 80, why: ["מתחרים בצמיחה מול נתח נמוך"] });

  // Recruit — overloaded / high per-broker / capacity gap.
  if (has(brokers, "recruitment_need") || perBroker > 10) cand.push({ s: "RECRUIT_BROKERS", score: 84, why: [`עומס ${perBroker.toFixed(1)} נכסים/מתווך`] });

  // Acquire inventory — shortage / spare capacity.
  if (has(inv, "inventory_shortage") || (perBroker < 2 && sig.brokers > 0)) cand.push({ s: "ACQUIRE_INVENTORY", score: 82, why: ["מחסור במלאי מול קיבולת פנויה"] });

  // Grow territory — healthy business + weak/emerging areas to capture.
  if (sig.businessScore >= 58 && (sig.weakAreas.length > 0 || has(comp, "expansion_opportunity") || has(comp, "territory_opportunity"))) cand.push({ s: "GROW_TERRITORY", score: 80, why: ["בסיס עסקי בריא + אזורי הרחבה זמינים"] });

  // Conversion — weak pipeline throughput.
  if (h.leadPipelineHealth < 50 || h.buyerPipelineHealth < 50 || sig.executionScore < 45) cand.push({ s: "IMPROVE_CONVERSION", score: 72, why: ["תפוקת משפך נמוכה"] });

  // Marketing — strong areas but thin lead flow.
  if (sig.strongAreas.length > 0 && sig.leadPipeline.total < Math.max(3, sig.brokers)) cand.push({ s: "STRENGTHEN_MARKETING", score: 64, why: ["אזורים חזקים עם זרימת לידים דקה"] });

  // Luxury / commercial expansion — missing segments with capacity.
  if (has(inv, "missing_luxury") && sig.businessScore >= 55) cand.push({ s: "LUXURY_EXPANSION", score: 68, why: ["פלח יוקרה לא מכוסה"] });
  if (has(inv, "missing_commercial") && sig.businessScore >= 55) cand.push({ s: "COMMERCIAL_EXPANSION", score: 60, why: ["פלח מסחרי לא מכוסה"] });

  // Cost optimization — surplus / low productivity.
  if (has(inv, "inventory_surplus") || (h.brokerProductivity < 40 && sig.brokers > 0)) cand.push({ s: "COST_OPTIMIZATION", score: 58, why: ["עודף/תפוקה נמוכה — ייעול"] });

  if (!cand.length) cand.push({ s: sig.businessScore >= 55 ? "GROW_TERRITORY" : "IMPROVE_CONVERSION", score: 55, why: ["ברירת מחדל לפי מצב עסקי"] });

  cand.sort((a, c) => c.score - a.score);
  const top = cand[0];
  const recommendedStrategy = top.s;
  const alternatives = [...new Set(cand.slice(1).map((c) => c.s))].filter((s) => s !== recommendedStrategy).slice(0, 3);
  const currentStrategy = inferCurrent(sig);

  const steps = STEPS[recommendedStrategy];
  const playbook: PlaybookStep[] = steps.map((st, i) => ({ order: i + 1, action: st.action, missionType: st.missionType, durationDays: st.durationDays, why: i === 0 ? (top.why[0] ?? "") : "" }));
  const expectedDurationDays = playbook.reduce((m, a) => Math.max(m, a.durationDays ?? 0), 0) || null;

  const confidence = clamp(0.4 * h.businessHealth + 0.35 * top.score + 0.25 * (sig.aiConfidence || 50));
  const businessImpact: Impact = HIGH_INVEST.includes(recommendedStrategy) || top.score >= 82 ? "high" : top.score >= 62 ? "medium" : "low";

  let signal: StrategyChange; let reason: string;
  if (sig.competitive.inventoryTrendPct > 10 && sig.businessScore >= 65) { signal = "succeeded"; reason = "צמיחה ובריאות עסקית גבוהות"; }
  else if (recommendedStrategy !== currentStrategy) { signal = "switch"; reason = `עבור מ-${currentStrategy} ל-${recommendedStrategy}`; }
  else if (sig.competitive.inventoryTrendPct < -8) { signal = "failed"; reason = "השוק מתכווץ תחת האסטרטגיה הנוכחית"; }
  else if (h.businessHealth < 45) { signal = "review"; reason = "בריאות עסקית נמוכה"; }
  else { signal = "working"; reason = "האסטרטגיה עובדת"; }

  return {
    currentStrategy, recommendedStrategy, confidence, businessImpact,
    why: top.why, expectedResult: RESULT[recommendedStrategy],
    estimatedRoi: businessImpact === "high" ? "צמיחה/נתח שוק בעל ערך גבוה" : businessImpact === "medium" ? "שיפור תפוקה/יעילות" : "אופטימיזציה",
    playbook, expectedDurationDays, requiredApprovals: APPROVALS[recommendedStrategy] ?? [], alternatives, change: { signal, reason },
  };
}
