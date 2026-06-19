/**
 * Seller Intelligence — deterministic scoring engine (no AI, no server imports).
 * Higher is better for every score EXCEPT churn risk (higher = more likely to leave).
 */

export interface SellerScoreContext {
  daysSinceContact: number | null;
  touchpointCount: number;
  recentTouchpoints: number; // last 30d
  reportsSent: number;
  reportsOpened: number;
  meetingsCount: number;
  callsCount: number;
  positiveResponses: number;
  negativeResponses: number;
  openCommitments: number;
  brokenCommitments: number;
  fulfilledCommitments: number;
  propertiesCount: number;
  activePropertiesCount: number;
  hasPricingConflict: boolean;
  openRisks: { severity: string }[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const reportOpenRate = (c: SellerScoreContext) =>
  c.reportsSent > 0 ? c.reportsOpened / c.reportsSent : 0;

export function calculateSellerTrustScore(c: SellerScoreContext): number {
  let s = 50;
  s += Math.min(20, c.fulfilledCommitments * 5);
  s -= Math.min(30, c.brokenCommitments * 10);
  s += Math.min(15, c.reportsSent * 3);
  s += Math.min(10, c.meetingsCount * 5);
  s += Math.min(10, c.positiveResponses * 5);
  s -= Math.min(15, c.negativeResponses * 5);
  if (c.daysSinceContact != null && c.daysSinceContact > 21) s -= 10;
  return clamp(s);
}

export function calculateSellerEngagementScore(c: SellerScoreContext): number {
  let s = 0;
  s += Math.min(30, c.recentTouchpoints * 6);
  s += reportOpenRate(c) * 30;
  s += Math.min(20, c.meetingsCount * 5);
  s += Math.min(20, c.callsCount * 4);
  return clamp(s);
}

export function calculateSellerResponseScore(c: SellerScoreContext): number {
  let s = 40;
  s += Math.min(30, c.positiveResponses * 8);
  s -= Math.min(30, c.negativeResponses * 8);
  s += reportOpenRate(c) * 30;
  return clamp(s);
}

export function calculateSellerConfidenceScore(c: SellerScoreContext): number {
  let s = 20;
  s += reportOpenRate(c) * 30;
  s += Math.min(25, c.meetingsCount * 6);
  s += Math.min(25, c.fulfilledCommitments * 6);
  s += c.hasPricingConflict ? -10 : 10;
  return clamp(s);
}

export function calculateSellerSatisfactionScore(c: SellerScoreContext): number {
  let s = 50;
  s += Math.min(25, c.positiveResponses * 6);
  s -= Math.min(35, c.negativeResponses * 8);
  s -= Math.min(20, c.brokenCommitments * 5);
  if (c.daysSinceContact != null && c.daysSinceContact > 21) s -= 10;
  return clamp(s);
}

export function calculateSellerChurnRiskScore(c: SellerScoreContext): number {
  let s = 0;
  if (c.daysSinceContact != null) {
    if (c.daysSinceContact > 30) s += 30;
    else if (c.daysSinceContact > 21) s += 20;
    else if (c.daysSinceContact > 14) s += 10;
  } else s += 15; // never contacted
  s += Math.min(24, c.brokenCommitments * 8);
  if (c.recentTouchpoints === 0) s += 15;
  if (c.reportsSent > 0 && c.reportsOpened === 0) s += 10;
  if (c.hasPricingConflict) s += 15;
  s += Math.min(20, c.negativeResponses * 6);
  for (const r of c.openRisks) {
    s += r.severity === "critical" ? 12 : r.severity === "high" ? 8 : r.severity === "medium" ? 4 : 2;
  }
  return clamp(s);
}

export function calculateSellerRelationshipScore(c: SellerScoreContext): number {
  const trust = calculateSellerTrustScore(c);
  const engagement = calculateSellerEngagementScore(c);
  const response = calculateSellerResponseScore(c);
  return clamp((trust + engagement + response) / 3);
}

export function calculateSellerHealthScore(c: SellerScoreContext): number {
  const trust = calculateSellerTrustScore(c);
  const engagement = calculateSellerEngagementScore(c);
  const confidence = calculateSellerConfidenceScore(c);
  const satisfaction = calculateSellerSatisfactionScore(c);
  const response = calculateSellerResponseScore(c);
  const churn = calculateSellerChurnRiskScore(c);
  const weighted =
    trust * 0.28 + engagement * 0.22 + confidence * 0.18 + satisfaction * 0.16 + response * 0.16;
  return clamp(weighted - churn * 0.25);
}

export interface SellerScoreSet {
  health: number;
  trust: number;
  engagement: number;
  confidence: number;
  satisfaction: number;
  churnRisk: number;
  response: number;
  relationship: number;
}

export function computeAllSellerScores(c: SellerScoreContext): SellerScoreSet {
  return {
    health: calculateSellerHealthScore(c),
    trust: calculateSellerTrustScore(c),
    engagement: calculateSellerEngagementScore(c),
    confidence: calculateSellerConfidenceScore(c),
    satisfaction: calculateSellerSatisfactionScore(c),
    churnRisk: calculateSellerChurnRiskScore(c),
    response: calculateSellerResponseScore(c),
    relationship: calculateSellerRelationshipScore(c),
  };
}

export type ScoreTone = "good" | "medium" | "risk";
export function scoreTone(n: number): ScoreTone {
  if (n >= 70) return "good";
  if (n >= 45) return "medium";
  return "risk";
}
export function churnTone(n: number): ScoreTone {
  if (n < 30) return "good";
  if (n < 60) return "medium";
  return "risk";
}
export function churnLevel(n: number): string {
  if (n < 25) return "יציב";
  if (n < 50) return "דורש תשומת לב";
  if (n < 75) return "בסיכון";
  return "קריטי";
}
