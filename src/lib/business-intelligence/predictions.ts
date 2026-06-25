// ============================================================================
// ZONO — Risk forecast (pure, deterministic — NO AI). Detects + ranks the eight
// executive risks from already-aggregated deterministic signals.
// ============================================================================
import { clamp, round } from "./analytics";
import type { RiskItem, RiskKey } from "./types";

export interface RiskInput {
  // pipeline / revenue
  pipelineValue: number;
  atRiskValue: number;
  dealsInProgress: number;
  stuckDeals: number;
  // opportunities
  ignoredHotOpportunities: number;
  sellersNotContacted: number;
  // churn
  sellersLikelyLost: number;
  buyersGoingCold: number;
  // team
  inactiveAgents: number;
  overdueTasks: number;
  agentsCount: number;
  // ops
  providerDegraded: boolean;
  creditsRemaining: number;
  creditsBudget: number;
}

const SEV_RANK: Record<RiskItem["severity"], number> = { urgent: 0, high: 1, medium: 2, low: 3 };
function sev(score: number): RiskItem["severity"] { return score >= 75 ? "urgent" : score >= 50 ? "high" : score >= 25 ? "medium" : "low"; }

export function forecastRisks(i: RiskInput): RiskItem[] {
  const out: RiskItem[] = [];
  const push = (key: RiskKey, label: string, score: number, reason: string, recommendedAction: string) => {
    const s = round(clamp(score, 0, 100), 0);
    if (s <= 0) return;
    out.push({ key, label, severity: sev(s), scorePercent: s, reason, recommendedAction });
  };

  const revRisk = i.pipelineValue > 0 ? (i.atRiskValue / i.pipelineValue) * 100 : 0;
  push("revenue_risk", "סיכון הכנסות", revRisk, `${round(revRisk, 0)}% מערך הפייפליין בסיכון.`, "לתעדף טיפול בהזדמנויות בסיכון.");
  push("pipeline_risk", "סיכון פייפליין", i.dealsInProgress > 0 ? (i.stuckDeals / i.dealsInProgress) * 100 : 0, `${i.stuckDeals} עסקאות תקועות מתוך ${i.dealsInProgress}.`, "לבדוק חסמים מול הסוכנים.");
  push("agent_burnout", "שחיקת סוכנים", i.agentsCount > 0 ? clamp((i.overdueTasks / Math.max(1, i.agentsCount)) * 8 + i.inactiveAgents * 15, 0, 100) : 0, `${i.overdueTasks} משימות באיחור · ${i.inactiveAgents} סוכנים לא פעילים.`, "לאזן עומסים ולבדוק זמינות.");
  push("opportunity_loss", "אובדן הזדמנויות", i.ignoredHotOpportunities * 18, `${i.ignoredHotOpportunities} הזדמנויות חמות ללא פנייה.`, "להקצות פנייה מיידית.");
  push("seller_churn", "נטישת מוכרים", i.sellersLikelyLost * 16 + clamp(i.sellersNotContacted * 4, 0, 40), `${i.sellersLikelyLost} בסיכון אובדן · ${i.sellersNotContacted} ללא קשר.`, "ניסיון פנייה אחרון למוכרים בסיכון.");
  push("buyer_churn", "נטישת קונים", i.buyersGoingCold * 10, `${i.buyersGoingCold} קונים מתקררים.`, "לחדש קשר עם הקונים.");
  if (i.providerDegraded) push("provider_risk", "סיכון ספק נתונים", 70, "איכות ספק הנתונים ירדה.", "לבדוק בריאות ספקים ב‑QA.");
  if (i.creditsBudget > 0) { const used = 1 - i.creditsRemaining / i.creditsBudget; push("budget_risk", "סיכון תקציב קרדיטים", used >= 0.85 ? clamp(used * 100, 0, 100) : 0, `נוצלו ${round(used * 100, 0)}% מהקרדיטים.`, "להגדיל תקציב או לצמצם סריקות."); }

  return out.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.scorePercent - a.scorePercent);
}
