// ============================================================================
// 🏠 Listing Agent — timeline, classification + scorecard (pure). 29.3. Parts 5/9/10.
// ============================================================================
import { computePropertyHealth, clamp } from "./health";
import { detectRisks, detectOpportunities } from "./risk-opportunity";
import { buildRecommendations } from "./recommendations";
import { computeMarketPerformance } from "./market-performance";
import type { ListingSignals, PropertyTimelineEntry, PropertyScorecard } from "./types";

const LUXURY = 4_000_000;

export function buildTimeline(sig: ListingSignals): PropertyTimelineEntry[] {
  const t: PropertyTimelineEntry[] = [];
  if (sig.createdAt) t.push({ at: sig.createdAt, kind: "created", label: "נוצר" });
  if (sig.listedAt) t.push({ at: sig.listedAt, kind: "published", label: "פורסם" });
  if (sig.lastActivityAt) t.push({ at: sig.lastActivityAt, kind: "buyer_activity", label: `פעילות קונים (${sig.recentBuyerActivity})` });
  if (sig.updatedAt) t.push({ at: sig.updatedAt, kind: "updated", label: "עודכן" });
  return t.sort((a, b) => b.at.localeCompare(a.at));
}

export function classifyListing(sig: ListingSignals, healthLabel: string, riskCount: number, hasHighRisk: boolean, oppHigh: boolean): string[] {
  const tags: string[] = [];
  if (healthLabel === "בריא") tags.push("בריא");
  if (healthLabel === "קריטי" || hasHighRisk) tags.push("קריטי");
  if ((sig.price ?? 0) >= LUXURY) tags.push("יוקרה");
  if (healthLabel !== "בריא" && (sig.timeOnMarketDays ?? 0) > 90) tags.push("מתיישן");
  if (oppHigh) tags.push("הזדמנות גבוהה");
  void riskCount;
  return [...new Set(tags)];
}

export function buildScorecard(sig: ListingSignals, now: number = Date.now()): PropertyScorecard {
  const health = computePropertyHealth(sig, now);
  const risks = detectRisks(sig, health);
  const opportunities = detectOpportunities(sig, health);
  const marketPerformance = computeMarketPerformance(sig, health);
  const recommendations = buildRecommendations(sig, health, risks, opportunities, marketPerformance);
  const timeline = buildTimeline(sig);
  const hasHighRisk = risks.some((r) => r.severity === "high");
  const oppHigh = opportunities.some((o) => o.impact === "high");
  const classification = classifyListing(sig, health.label, risks.length, hasHighRisk, oppHigh);
  return {
    id: sig.id, title: sig.title, city: sig.city, price: sig.price, status: sig.status,
    health, risks, opportunities, recommendations, timeline, classification,
    aiConfidence: clamp(health.confidence), truthScore: sig.truthScore, activeMissions: sig.openMissions,
    valuation: sig.valuation, marketPerformance,
  };
}
