/**
 * Deal Forecast Engine — deterministic, AI-ready revenue prediction.
 * Pure, client-safe, no LLM. Combines every intelligence layer into a single
 * closing probability, timeline, revenue and risk forecast per deal candidate.
 */

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export interface ForecastInput {
  // Match
  matchClosingProbability: number; // 0..100
  matchStage: string;
  compatibility: number;
  matchRisk: number;
  matchMomentum: number;
  matchUrgency: number;
  estimatedValue: number | null;
  estimatedCommission: number | null;
  // Buyer
  buyerReadiness: number;
  buyerFinancing: number;
  buyerEngagement: number;
  buyerConversion: number;
  // Seller
  sellerTrust: number;
  sellerChurnRisk: number;
  // Property
  propertyHealth: number;
  propertyMomentum: number;
  propertyExposure: number;
  // Communication
  daysSinceContact: number | null;
  followupRisk: number;
  openCommitments: number;
  negativeSentiment: boolean;
  // Graph
  relationshipStrength: number; // 0..100
  dealAcceleration: boolean;
  // Market
  marketDemand: number;
  // Agent
  agentConversion: number;
  agentWorkloadCapacity: number; // 0..100 (higher = more capacity)
  agentAvgDaysToClose: number | null;
}

const STAGE_BASE: Record<string, number> = {
  candidate: 35, presented: 45, viewing_scheduled: 55, viewed: 60,
  negotiation: 72, offer_submitted: 80, offer_made: 80, accepted: 90, closed: 100, lost: 5,
};
const STAGE_DAYS: Record<string, number> = {
  candidate: 75, presented: 60, viewing_scheduled: 45, viewed: 38,
  negotiation: 21, offer_submitted: 12, offer_made: 12, accepted: 7, closed: 0, lost: 0,
};

// ── 9 score functions ────────────────────────────────────────────────────────
export function calculateClosingProbability(i: ForecastInput): number {
  const stageBase = STAGE_BASE[i.matchStage] ?? 40;
  let p = stageBase * 0.30
    + i.matchClosingProbability * 0.20
    + i.buyerReadiness * 0.10
    + i.buyerFinancing * 0.08
    + i.buyerConversion * 0.07
    + i.sellerTrust * 0.06
    + i.propertyHealth * 0.05
    + i.relationshipStrength * 0.06
    + i.agentConversion * 0.08;
  if (i.dealAcceleration) p += 5;
  if (i.negativeSentiment) p -= 8;
  if (i.sellerChurnRisk >= 60) p -= 6;
  if (i.daysSinceContact != null && i.daysSinceContact > 14) p -= 6;
  return clamp(p);
}

export function calculateExpectedDaysToClose(i: ForecastInput): number {
  let base = STAGE_DAYS[i.matchStage] ?? 60;
  if (i.agentAvgDaysToClose != null) base = Math.round((base + i.agentAvgDaysToClose) / 2);
  if (i.dealAcceleration) base = Math.round(base * 0.8);
  if (i.marketDemand >= 70) base = Math.round(base * 0.9);
  if (i.followupRisk >= 60 || (i.daysSinceContact != null && i.daysSinceContact > 21)) base = Math.round(base * 1.25);
  return Math.max(1, base);
}

export function calculateExpectedCloseDate(days: number, fromIso = new Date().toISOString()): string {
  const d = new Date(fromIso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function calculateDealHealthScore(i: ForecastInput): number {
  return clamp(i.buyerReadiness * 0.22 + i.sellerTrust * 0.18 + i.propertyHealth * 0.16 + i.relationshipStrength * 0.16 + i.compatibility * 0.14 + i.matchMomentum * 0.14);
}

export function calculateDealRiskScore(i: ForecastInput): number {
  let r = i.matchRisk * 0.35 + i.sellerChurnRisk * 0.2 + i.followupRisk * 0.2;
  if (i.negativeSentiment) r += 12;
  if (i.daysSinceContact != null && i.daysSinceContact > 21) r += 10;
  if (i.buyerFinancing < 40) r += 10;
  if (i.openCommitments > 0) r += 5;
  return clamp(r);
}

export function calculateUrgencyScore(i: ForecastInput): number {
  let u = i.matchUrgency * 0.5;
  if (i.matchStage === "negotiation" || i.matchStage === "offer_submitted" || i.matchStage === "offer_made") u += 30;
  if (i.daysSinceContact != null && i.daysSinceContact > 14) u += 15;
  if (i.negativeSentiment) u += 15;
  return clamp(u);
}

export function calculateMomentumScore(i: ForecastInput): number {
  let m = i.matchMomentum * 0.5 + i.buyerEngagement * 0.3 + i.relationshipStrength * 0.2;
  if (i.dealAcceleration) m += 10;
  if (i.daysSinceContact != null && i.daysSinceContact > 21) m -= 15;
  return clamp(m);
}

export function calculateConfidenceScore(i: ForecastInput): number {
  // More data/engagement + later stage = higher confidence in the forecast.
  const stageBase = STAGE_BASE[i.matchStage] ?? 40;
  let c = 40 + stageBase * 0.3;
  if (i.relationshipStrength >= 60) c += 10;
  if (i.daysSinceContact != null && i.daysSinceContact <= 7) c += 10;
  if (i.buyerFinancing >= 70) c += 8;
  return clamp(c);
}

export function calculateProbabilityWeightedRevenue(estimatedCommission: number | null, closingProbability: number): number {
  if (!estimatedCommission) return 0;
  return Math.round(estimatedCommission * (closingProbability / 100));
}

// ── Aggregate forecast ───────────────────────────────────────────────────────
export interface ForecastScores {
  closing_probability: number; expected_days_to_close: number; expected_close_date: string;
  deal_health_score: number; deal_risk_score: number; urgency_score: number; momentum_score: number;
  confidence_score: number; probability_weighted_revenue: number;
}

export function computeForecast(i: ForecastInput): ForecastScores {
  const closing = calculateClosingProbability(i);
  const days = calculateExpectedDaysToClose(i);
  const commission = i.estimatedCommission ?? (i.estimatedValue ? Math.round(i.estimatedValue * 0.02) : 0);
  return {
    closing_probability: closing, expected_days_to_close: days, expected_close_date: calculateExpectedCloseDate(days),
    deal_health_score: calculateDealHealthScore(i), deal_risk_score: calculateDealRiskScore(i),
    urgency_score: calculateUrgencyScore(i), momentum_score: calculateMomentumScore(i),
    confidence_score: calculateConfidenceScore(i),
    probability_weighted_revenue: calculateProbabilityWeightedRevenue(commission, closing),
  };
}

// ── Blocker + next best action ───────────────────────────────────────────────
export interface ForecastAction { blocker: string | null; nextAction: string; probabilityLift: number; urgency: number; confidence: number }

export function deriveForecastAction(i: ForecastInput, s: ForecastScores): ForecastAction {
  let blocker: string | null = null;
  let nextAction = "המשך קידום העסקה";
  let lift = 5, urgency = 50;
  const confidence = 70;

  if (i.buyerFinancing < 40) { blocker = "מימון לא מאושר"; nextAction = "בדיקת מימון מול הקונה"; lift = 15; urgency = 70; }
  else if (i.negativeSentiment) { blocker = "סנטימנט שלילי"; nextAction = "שיחת התנגדויות עם הצד הרלוונטי"; lift = 12; urgency = 80; }
  else if (i.daysSinceContact != null && i.daysSinceContact > 14) { blocker = `אין קשר ${i.daysSinceContact} ימים`; nextAction = "פולואפ מיידי"; lift = 14; urgency = 75; }
  else if (i.sellerChurnRisk >= 60) { blocker = "סיכון נטישת מוכר"; nextAction = "שיחת חיזוק עם המוכר"; lift = 10; urgency = 70; }
  else if (i.matchStage === "negotiation" || i.matchStage === "offer_submitted") { nextAction = "הכן/קדם הצעה לסגירה"; lift = 12; urgency = 85; }
  else if (i.matchStage === "viewed") { nextAction = "פולואפ אחרי ביקור + הכנת הצעה"; lift = 10; urgency = 65; }
  else if (i.matchStage === "presented" || i.matchStage === "candidate") { nextAction = "תאם ביקור בנכס"; lift = 9; urgency = 55; }
  if (s.deal_risk_score >= 65) urgency = Math.max(urgency, 80);
  return { blocker, nextAction, probabilityLift: lift, urgency, confidence };
}

export function buildForecastAi(name: string, s: ForecastScores, a: ForecastAction): { ai_summary: string; ai_risk_summary: string; ai_recommendation_summary: string; reason: string } {
  const reason = `שלב מתקדם + סיכוי ${s.closing_probability}% · בריאות ${s.deal_health_score} · מומנטום ${s.momentum_score}`;
  return {
    ai_summary: `${name}: סיכוי סגירה ${s.closing_probability}%, צפי ${s.expected_days_to_close} ימים, הכנסה משוקללת.`,
    ai_risk_summary: s.deal_risk_score >= 60 ? `סיכון גבוה (${s.deal_risk_score})${a.blocker ? ` — ${a.blocker}` : ""}.` : `סיכון נמוך-בינוני (${s.deal_risk_score}).`,
    ai_recommendation_summary: `פעולה מומלצת: ${a.nextAction} (העלאת סיכוי ~${a.probabilityLift}%).`,
    reason,
  };
}
