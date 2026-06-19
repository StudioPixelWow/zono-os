/**
 * Buyer Intelligence — deterministic scoring engine (no AI, no server imports).
 * Higher is better for every score. Conversion probability is the headline.
 */

export interface BuyerScoreContext {
  // qualification
  hasBudget: boolean;
  hasPreferredAreas: boolean;
  hasPreferredTypes: boolean;
  hasPreapproval: boolean;
  // engagement / activity
  daysSinceActivity: number | null;
  recentTouchpoints: number; // 30d
  callsCount: number;
  meetingsCount: number;
  positiveResponses: number;
  negativeResponses: number;
  // property interactions
  viewedCount: number;
  likedCount: number;
  rejectedCount: number;
  visitsCount: number;
  offersCount: number;
  // commitments / objections
  fulfilledCommitments: number;
  brokenCommitments: number;
  openObjections: number;
  // journey
  stageIndex: number; // 0..10
  openRisks: { severity: string }[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function calculateBuyerQualificationScore(c: BuyerScoreContext): number {
  let s = 0;
  if (c.hasBudget) s += 30;
  if (c.hasPreferredAreas) s += 20;
  if (c.hasPreferredTypes) s += 15;
  if (c.hasPreapproval) s += 25;
  s += Math.min(10, c.meetingsCount * 5);
  return clamp(s);
}

export function calculateBuyerEngagementScore(c: BuyerScoreContext): number {
  let s = 0;
  s += Math.min(25, c.recentTouchpoints * 5);
  s += Math.min(20, c.viewedCount * 4);
  s += Math.min(20, c.visitsCount * 10);
  s += Math.min(15, c.callsCount * 4);
  s += Math.min(10, c.likedCount * 5);
  s += Math.min(10, c.positiveResponses * 5);
  return clamp(s);
}

export function calculateBuyerTrustScore(c: BuyerScoreContext): number {
  let s = 50;
  s += Math.min(20, c.fulfilledCommitments * 6);
  s -= Math.min(30, c.brokenCommitments * 10);
  s += Math.min(15, c.meetingsCount * 5);
  s += Math.min(10, c.positiveResponses * 4);
  s -= Math.min(15, c.negativeResponses * 5);
  return clamp(s);
}

export function calculateBuyerFinancingScore(c: BuyerScoreContext): number {
  let s = c.hasPreapproval ? 70 : 25;
  if (c.hasBudget) s += 15;
  s += Math.min(15, c.fulfilledCommitments * 5);
  return clamp(s);
}

export function calculateBuyerMomentumScore(c: BuyerScoreContext): number {
  let raw = 10;
  raw += Math.min(30, c.recentTouchpoints * 6);
  raw += Math.min(25, c.visitsCount * 9);
  raw += Math.min(20, c.viewedCount * 4);
  raw += Math.min(15, c.offersCount * 15);
  const penalty = c.daysSinceActivity != null ? Math.min(50, c.daysSinceActivity * 3) : 30;
  return clamp(raw - penalty);
}

export function calculateBuyerReadinessScore(c: BuyerScoreContext): number {
  const financing = calculateBuyerFinancingScore(c);
  const engagement = calculateBuyerEngagementScore(c);
  let s = financing * 0.35 + engagement * 0.3;
  s += Math.min(20, c.visitsCount * 7);
  s += Math.min(15, c.stageIndex * 2);
  return clamp(s);
}

export function calculateBuyerHealthScore(c: BuyerScoreContext): number {
  const qualification = calculateBuyerQualificationScore(c);
  const engagement = calculateBuyerEngagementScore(c);
  const trust = calculateBuyerTrustScore(c);
  const momentum = calculateBuyerMomentumScore(c);
  let riskPenalty = 0;
  for (const r of c.openRisks) riskPenalty += r.severity === "critical" ? 15 : r.severity === "high" ? 10 : r.severity === "medium" ? 5 : 2;
  return clamp(qualification * 0.25 + engagement * 0.3 + trust * 0.2 + momentum * 0.25 - riskPenalty);
}

export function calculateBuyerConversionProbability(c: BuyerScoreContext): number {
  const financing = calculateBuyerFinancingScore(c);
  const engagement = calculateBuyerEngagementScore(c);
  const trust = calculateBuyerTrustScore(c);
  const momentum = calculateBuyerMomentumScore(c);
  let s =
    financing * 0.25 + engagement * 0.2 + trust * 0.15 + momentum * 0.15 + Math.min(100, c.stageIndex * 9) * 0.25;
  s += Math.min(10, c.offersCount * 10);
  s -= Math.min(20, c.openObjections * 6);
  return clamp(s);
}

export interface BuyerScoreSet {
  health: number;
  readiness: number;
  engagement: number;
  qualification: number;
  trust: number;
  financing: number;
  momentum: number;
  conversion: number;
}

export function computeAllBuyerScores(c: BuyerScoreContext): BuyerScoreSet {
  return {
    health: calculateBuyerHealthScore(c),
    readiness: calculateBuyerReadinessScore(c),
    engagement: calculateBuyerEngagementScore(c),
    qualification: calculateBuyerQualificationScore(c),
    trust: calculateBuyerTrustScore(c),
    financing: calculateBuyerFinancingScore(c),
    momentum: calculateBuyerMomentumScore(c),
    conversion: calculateBuyerConversionProbability(c),
  };
}

export type Tone = "good" | "medium" | "risk";
export function scoreTone(n: number): Tone {
  if (n >= 70) return "good";
  if (n >= 45) return "medium";
  return "risk";
}

/** Readiness label per the readiness engine. */
export function readinessLabel(readiness: number): string {
  if (readiness >= 70) return "מוכן לרכישה";
  if (readiness >= 45) return "מתחמם";
  return "שלב מוקדם";
}
