// ============================================================================
// ✅ Listing Intelligence Agent — self-tests (pure, offline). 29.3. Part 11.
// Scenarios: new / healthy / stale / overpriced / underpriced / luxury /
// high-demand / no-activity / missing-valuation / seller-at-risk — plus the
// agent producing recommendation + mission proposals (nothing auto-executes).
// ============================================================================
import { buildScorecard } from "./scorecard";
import { listingAgent } from "./agent";
import type { ListingSignals } from "./types";

export interface LACheck { name: string; pass: boolean; detail: string }
export interface LASelfCheck { ok: boolean; total: number; passed: number; checks: LACheck[] }

const NOW = Date.UTC(2026, 6, 2);
const DAY = 86400000;
const iso = (d: number) => new Date(NOW - d * DAY).toISOString();

const sig = (over: Partial<ListingSignals> = {}): ListingSignals => ({
  id: "P1", title: "דירה 4 חדרים רחובות", city: "רחובות", type: "apartment", status: "active", listingKind: "sale",
  price: 2_000_000, rooms: 4, sizeSqm: 100, listedAt: iso(15), createdAt: iso(18), updatedAt: iso(2),
  timeOnMarketDays: 15, zonoScore: 70, estimatedDaysToSell: 60, hasExclusivity: true, exclusivityEndsAt: iso(-60),
  matchCount: 6, avgMatchScore: 78, recentBuyerActivity: 3,
  market: { inventoryTrendPct: 2, concentrationLevel: "moderate", topSharePct: 30 },
  sellerLinked: true, valuationEstimate: 1_950_000, campaignActive: true, lastActivityAt: iso(2), openMissions: 1, truthScore: 70, ...over,
});

export function runSelfCheck(): LASelfCheck {
  const checks: LACheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });
  const card = (o: Partial<ListingSignals>) => buildScorecard(sig(o), NOW);
  const hasRisk = (c: ReturnType<typeof card>, t: string) => c.risks.some((r) => r.type === t);
  const hasRec = (c: ReturnType<typeof card>, re: RegExp) => c.recommendations.some((r) => re.test(r.action));

  // New listing.
  const fresh = card({ timeOnMarketDays: 3, listedAt: iso(3), matchCount: 0, avgMatchScore: 0, recentBuyerActivity: 0 });
  add("new listing → health 'חדש'", fresh.health.label === "חדש", fresh.health.label);
  add("scorecard full model", typeof fresh.health.listingHealth === "number" && Array.isArray(fresh.risks) && Array.isArray(fresh.recommendations) && Array.isArray(fresh.timeline), "");

  // Healthy.
  const healthy = card({ matchCount: 7, avgMatchScore: 82, recentBuyerActivity: 3, updatedAt: iso(2), lastActivityAt: iso(2) });
  add("healthy listing classified", healthy.classification.includes("בריא") || healthy.health.label === "בריא", healthy.health.label);

  // Stale.
  const stale = card({ timeOnMarketDays: 120, listedAt: iso(120), updatedAt: iso(100), lastActivityAt: iso(100), matchCount: 1, recentBuyerActivity: 0 });
  add("stale risk + refresh rec", hasRisk(stale, "stale") && hasRec(stale, /רענן|החלף תמונות/), "");
  add("stale classified", stale.classification.includes("מתיישן") || stale.classification.includes("קריטי"), stale.classification.join(","));

  // Overpriced.
  const over = card({ timeOnMarketDays: 80, listedAt: iso(80), matchCount: 1, avgMatchScore: 0, recentBuyerActivity: 0, updatedAt: iso(40), lastActivityAt: iso(40) });
  add("overpriced risk + lower-price rec", hasRisk(over, "overpriced") && hasRec(over, /הורד מחיר/), "");

  // Underpriced.
  const under = card({ timeOnMarketDays: 10, listedAt: iso(10), matchCount: 10, avgMatchScore: 85, recentBuyerActivity: 5 });
  add("underpriced risk / price opportunity", hasRisk(under, "underpriced") || under.opportunities.some((o) => o.type === "price_opportunity"), "");

  // Luxury.
  add("luxury classified", card({ price: 5_000_000 }).classification.includes("יוקרה"), "");

  // High demand.
  const demand = card({ matchCount: 9, avgMatchScore: 80, recentBuyerActivity: 4 });
  add("high demand opp + open house rec", demand.opportunities.some((o) => o.type === "high_demand") && hasRec(demand, /בית פתוח/), "");

  // No activity.
  const noact = card({ matchCount: 2, recentBuyerActivity: 0, updatedAt: iso(120), lastActivityAt: iso(120) });
  add("no activity risk + buyer follow-up", hasRisk(noact, "no_activity") && hasRec(noact, /חזור למתעניינים/), "");

  // Missing valuation.
  const noval = card({ valuationEstimate: null });
  add("missing valuation risk + rec", hasRisk(noval, "missing_valuation") && hasRec(noval, /הערכת שווי/), "");

  // Seller at risk.
  const sellerRisk = card({ sellerLinked: true, timeOnMarketDays: 95, listedAt: iso(95), updatedAt: iso(95), lastActivityAt: iso(95), matchCount: 1, recentBuyerActivity: 0 });
  add("seller frustration risk + call seller", hasRisk(sellerRisk, "seller_frustration") && hasRec(sellerRisk, /התקשר למוכר/), "");

  // Recommendations carry priority/ROI/confidence/impact/deadline/evidence.
  add("recs carry full metadata", stale.recommendations.every((r) => typeof r.priority === "number" && r.roi.length > 0 && typeof r.confidence === "number" && !!r.impact && Array.isArray(r.evidence)), "");
  add("recs ranked by priority", over.recommendations.every((r, i) => i === 0 || over.recommendations[i - 1].priority >= r.priority), "");

  // Agent proposals (framework reuse) — recommendation-only, nothing executes.
  const proposals = listingAgent.run({ now: NOW, orgId: "o", data: { listings: [sig({ timeOnMarketDays: 90, matchCount: 1, updatedAt: iso(90), lastActivityAt: iso(90) })] } });
  add("agent emits proposals per property", proposals.length > 0 && proposals.every((p) => p.entityType === "property" && p.entityId === "P1"), "");
  add("agent emits a mission proposal (approval-gated)", proposals.some((p) => p.kind === "mission" && !!p.missionType), "");
  add("agent permissions request approval, no auto-exec", listingAgent.permissions.includes("REQUEST_APPROVAL") && !listingAgent.permissions.includes("AUTO_EXECUTE"), "");
  add("empty listings → no proposals", listingAgent.run({ now: NOW, orgId: "o", data: {} }).length === 0, "");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
