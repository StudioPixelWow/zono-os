/**
 * Property Intelligence — deterministic scoring engine (no AI, no server imports).
 *
 * Each calculate* function maps a gathered ScoreContext to a 0..100 score.
 * The service gathers the context once (counts, recency) and calls these.
 * Higher is better for every score EXCEPT risk_score (higher = more risk).
 */

export interface ScoreContext {
  // completeness
  hasPrice: boolean;
  hasCity: boolean;
  hasAddress: boolean;
  hasRooms: boolean;
  hasSize: boolean;
  hasFloor: boolean;
  hasDescription: boolean;
  hasMarketingDescription: boolean;
  hasPrimaryImage: boolean;
  hasCoords: boolean;
  mediaCount: number;
  hasVideo: boolean;
  hasFloorPlan: boolean;
  documentCount: number;
  stagePublished: boolean;
  // pricing / market
  hasPriceHistory: boolean;
  hasPricePerSqm: boolean;
  // exposure
  activeChannels: number;
  totalViews: number;
  totalClicks: number;
  totalLeads: number;
  // seller trust
  touchpointCount: number;
  reportsSent: number;
  meetingsCompleted: number;
  positiveSellerResponses: number;
  daysSinceSellerUpdate: number | null;
  // momentum
  recentActivities: number;
  recentLeads: number;
  recentVisits: number;
  recentTasksCompleted: number;
  daysSinceActivity: number;
  // risk inputs
  openRisks: { severity: string }[];
  overdueTasks: number;
  stalled: boolean;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function calculatePropertyHealthScore(c: ScoreContext): number {
  let s = 0;
  if (c.hasPrice) s += 15;
  if (c.hasCity) s += 10;
  if (c.hasAddress) s += 8;
  if (c.hasRooms) s += 7;
  if (c.hasSize) s += 7;
  if (c.hasFloor) s += 3;
  if (c.hasDescription) s += 10;
  if (c.hasPrimaryImage) s += 12;
  s += c.mediaCount >= 3 ? 10 : c.mediaCount >= 1 ? 5 : 0;
  if (c.documentCount >= 1) s += 8;
  if (c.stagePublished) s += 10;
  return clamp(s);
}

export function calculateMarketingScore(c: ScoreContext): number {
  let s = 0;
  if (c.hasPrimaryImage) s += 15;
  s += c.mediaCount >= 5 ? 20 : c.mediaCount >= 3 ? 12 : c.mediaCount >= 1 ? 6 : 0;
  if (c.hasVideo) s += 15;
  if (c.hasFloorPlan) s += 10;
  if (c.hasMarketingDescription) s += 20;
  if (c.documentCount >= 1) s += 10;
  if (c.activeChannels >= 1) s += 10;
  return clamp(s);
}

export function calculateExposureScore(c: ScoreContext): number {
  let s = 0;
  s += Math.min(40, c.activeChannels * 10);
  s += Math.min(20, c.totalViews / 5);
  s += Math.min(15, c.totalClicks / 2);
  s += Math.min(25, c.totalLeads * 5);
  return clamp(s);
}

export function calculateSellerTrustScore(c: ScoreContext): number {
  let s =
    c.daysSinceSellerUpdate == null
      ? 25
      : c.daysSinceSellerUpdate <= 7
        ? 40
        : c.daysSinceSellerUpdate <= 14
          ? 25
          : 10;
  s += Math.min(20, c.touchpointCount * 4);
  s += Math.min(20, c.reportsSent * 7);
  s += Math.min(10, c.meetingsCompleted * 5);
  s += Math.min(10, c.positiveSellerResponses * 5);
  return clamp(s);
}

export function calculateMarketPositionScore(c: ScoreContext): number {
  if (!c.hasPrice) return 0;
  let s = 30; // baseline: a price exists
  if (c.hasPriceHistory) s += 35;
  if (c.hasPricePerSqm) s += 25;
  // remaining headroom reserved for real market comparison (future).
  return clamp(s);
}

export function calculateMomentumScore(c: ScoreContext): number {
  let raw = 10;
  raw += Math.min(30, c.recentActivities * 6);
  raw += Math.min(25, c.recentLeads * 8);
  raw += Math.min(20, c.recentVisits * 7);
  raw += Math.min(15, c.recentTasksCompleted * 5);
  const penalty = Math.min(50, c.daysSinceActivity * 3);
  return clamp(raw - penalty);
}

export function calculateRiskScore(c: ScoreContext): number {
  let s = 0;
  for (const r of c.openRisks) {
    s +=
      r.severity === "critical"
        ? 25
        : r.severity === "high"
          ? 20
          : r.severity === "medium"
            ? 12
            : 6;
  }
  s += Math.min(20, c.overdueTasks * 5);
  if (c.stalled) s += 20;
  return clamp(s);
}

export interface ScoreSet {
  health: number;
  marketing: number;
  exposure: number;
  sellerTrust: number;
  marketPosition: number;
  momentum: number;
  risk: number;
  success: number;
}

export function calculateSuccessScore(s: Omit<ScoreSet, "success">): number {
  const weighted =
    s.health * 0.2 +
    s.marketing * 0.18 +
    s.exposure * 0.15 +
    s.sellerTrust * 0.15 +
    s.marketPosition * 0.12 +
    s.momentum * 0.2;
  return clamp(weighted - s.risk * 0.25);
}

export function computeAllScores(c: ScoreContext): ScoreSet {
  const base = {
    health: calculatePropertyHealthScore(c),
    marketing: calculateMarketingScore(c),
    exposure: calculateExposureScore(c),
    sellerTrust: calculateSellerTrustScore(c),
    marketPosition: calculateMarketPositionScore(c),
    momentum: calculateMomentumScore(c),
    risk: calculateRiskScore(c),
  };
  return { ...base, success: calculateSuccessScore(base) };
}

// ── Tones for the UI ─────────────────────────────────────────────────────────
export type ScoreTone = "good" | "medium" | "risk";

/** Higher is better. */
export function scoreTone(n: number): ScoreTone {
  if (n >= 70) return "good";
  if (n >= 45) return "medium";
  return "risk";
}

/** Risk score: higher is worse. */
export function riskTone(n: number): ScoreTone {
  if (n < 30) return "good";
  if (n < 60) return "medium";
  return "risk";
}
