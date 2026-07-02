// ============================================================================
// 🏢 Office Growth Agent — Decision engine + risks/opportunities (pure). 29.7.
// Part 8. Recommends Recruit/Expand/Reduce/Pause/Invest/Reallocate/Campaign/
// Training/Follow-up — every recommendation explains WHY. Evidence-only;
// recommendations only (approval-gated). Nothing executes.
// ============================================================================
import type { OfficeSignals, OfficeHealth, InventoryFinding, BrokerFinding, CompetitiveFinding, PipelineIntelligence, OfficeDecision, OfficeRisk, OfficeOpportunity } from "./types";

const ratio = (a: number, b: number): number => (b > 0 ? a / b : 0);
const has = <T extends { type: string }>(xs: T[], t: string) => xs.some((x) => x.type === t);

export function buildDecisions(
  sig: OfficeSignals, h: OfficeHealth, inv: InventoryFinding[], brokers: BrokerFinding[], comp: CompetitiveFinding[], pipe: PipelineIntelligence,
): OfficeDecision[] {
  const out: OfficeDecision[] = [];
  const perBroker = ratio(sig.activeListings, Math.max(1, sig.brokers));

  if (has(brokers, "recruitment_need") || perBroker > 10) out.push({ type: "RECRUIT", title: "גייס מתווכים", why: "עומס נכסים גבוה למתווך מגביל המרה — גיוס יגדיל קיבולת.", evidence: [`${perBroker.toFixed(1)} נכסים/מתווך`], impact: "high", requiresApproval: true });
  if ((has(comp, "expansion_opportunity") || has(comp, "territory_opportunity")) && h.expansionReadiness >= 55) out.push({ type: "EXPAND", title: "הרחב לאזורי יעד", why: "מוכנות הרחבה גבוהה + אזורים מתפתחים/חלשים לתפיסה.", evidence: [`מוכנות הרחבה ${h.expansionReadiness}`], impact: "high", requiresApproval: true });
  if (has(inv, "inventory_surplus") || (h.brokerProductivity < 40 && sig.brokers > 0)) out.push({ type: "REDUCE", title: "צמצם/ייעל משאבים", why: "עודף מלאי/תפוקה נמוכה — ייעול הקצאה ישפר יעילות.", evidence: [`תפוקת מתווך ${h.brokerProductivity}`], impact: "medium", requiresApproval: true });
  if (sig.competitive.inventoryTrendPct < -8 && sig.businessScore < 45) out.push({ type: "PAUSE", title: "השהה הרחבה", why: "שוק מתכווץ ובריאות עסקית נמוכה — השהה השקעות הרחבה עד התייצבות.", evidence: [`מגמת שוק ${sig.competitive.inventoryTrendPct}%`], impact: "medium", requiresApproval: true });
  if (has(inv, "missing_luxury") || has(inv, "missing_commercial")) out.push({ type: "INVEST", title: "השקע בפלח חסר", why: "פלח יוקרה/מסחרי אינו מכוסה — השקעה תפתח מקור הכנסה חדש.", evidence: inv.filter((f) => f.type === "missing_luxury" || f.type === "missing_commercial").map((f) => f.title), impact: "medium", requiresApproval: true });
  if (has(brokers, "overloaded_broker") && has(brokers, "unused_capacity")) out.push({ type: "REALLOCATE", title: "הקצה מלאי/לידים מחדש", why: "עומס יתר לצד קיבולת פנויה — איזון יגדיל תפוקה ללא גיוס.", evidence: ["עומס יתר + קיבולת פנויה"], impact: "medium", requiresApproval: false });
  if (sig.strongAreas.length > 0 && sig.leadPipeline.total < Math.max(3, sig.brokers)) out.push({ type: "CAMPAIGN", title: "השק קמפיין שיווק", why: "אזורים חזקים עם זרימת לידים דקה — קמפיין ימנף את המובילות.", evidence: [`${sig.leadPipeline.total} לידים · אזורים חזקים ${sig.strongAreas.length}`], impact: "medium", requiresApproval: true });
  if (has(brokers, "training_opportunity") || sig.executionScore < 45) out.push({ type: "TRAINING", title: "הפעל הדרכה", why: "המרה/ביצוע נמוכים — הדרכה ממוקדת תשפר תוצאות מאותו משפך.", evidence: [`ביצוע ${sig.executionScore}`], impact: "medium", requiresApproval: false });
  if (pipe.bottlenecks.length > 0) out.push({ type: "FOLLOW_UP", title: "טפל בצווארי בקבוק", why: "זוהו צווארי בקבוק במשפך — מעקב ממוקד ישחרר תפוקה.", evidence: pipe.bottlenecks.slice(0, 3), impact: pipe.bottlenecks.length >= 3 ? "high" : "medium", requiresApproval: false });

  return out;
}

export function detectOfficeRisks(sig: OfficeSignals, h: OfficeHealth, comp: CompetitiveFinding[]): OfficeRisk[] {
  const out: OfficeRisk[] = [];
  if (has(comp, "lost_market_share")) out.push({ title: "אובדן נתח שוק", severity: "high", evidence: [`מגמת מלאי ${sig.competitive.inventoryTrendPct}%`] });
  if (sig.brokers > 0 && ratio(sig.activeListings, sig.brokers) > 12) out.push({ title: "עומס יתר על המתווכים", severity: "high", evidence: [`${ratio(sig.activeListings, sig.brokers).toFixed(1)} נכסים/מתווך`] });
  if (h.inventoryHealth < 45) out.push({ title: "בריאות מלאי נמוכה", severity: "medium", evidence: [`מלאי ${h.inventoryHealth} · מתיישנים ${sig.listingPipeline.stale}`] });
  if (sig.missions.blocked + sig.missions.waiting > Math.max(1, sig.missions.active) * 0.4) out.push({ title: "צוואר בקבוק בביצוע משימות", severity: "medium", evidence: [`${sig.missions.blocked} חסומות · ${sig.missions.waiting} ממתינות`] });
  if (sig.dataQualityScore < 45) out.push({ title: "איכות נתונים נמוכה", severity: "medium", evidence: [`איכות נתונים ${sig.dataQualityScore}`] });
  if (has(comp, "competitive_threat")) out.push({ title: "איום תחרותי בשוק מרוכז", severity: "high", evidence: [`ריכוזיות ${sig.competitive.marketConcentration}`] });
  return out;
}

export function detectOfficeOpportunities(sig: OfficeSignals, inv: InventoryFinding[], comp: CompetitiveFinding[]): OfficeOpportunity[] {
  const out: OfficeOpportunity[] = [];
  for (const c of comp.filter((x) => x.type === "expansion_opportunity" || x.type === "territory_opportunity")) out.push({ title: c.title, impact: c.impact, evidence: c.evidence });
  for (const c of comp.filter((x) => x.type === "weak_competitor")) out.push({ title: `חלון מול ${c.title}`, impact: "medium", evidence: c.evidence });
  if (has(inv, "strong_neighborhood")) { const f = inv.find((x) => x.type === "strong_neighborhood")!; out.push({ title: `מנף אזור חזק: ${f.title}`, impact: "medium", evidence: f.evidence }); }
  if (has(inv, "missing_luxury")) out.push({ title: "כניסה לפלח יוקרה", impact: "medium", evidence: ["0 נכסי יוקרה"] });
  if (has(inv, "missing_commercial")) out.push({ title: "כניסה לפלח מסחרי", impact: "low", evidence: ["0 נכסים מסחריים"] });
  if (sig.buyerPipeline.withMatches > 0 && sig.sellerPipeline.readyToSign > 0) out.push({ title: "חיבור קונים↔מוכרים מוכנים", impact: "high", evidence: [`${sig.buyerPipeline.withMatches} קונים עם התאמות · ${sig.sellerPipeline.readyToSign} מוכרים לחתימה`] });
  return out;
}
