// ============================================================================
// ✅ Listing Intelligence Agent — self-tests (pure, offline). 29.3. Part 11.
// Scenarios: new / healthy / stale / overpriced / underpriced / luxury /
// high-demand / no-activity / missing-valuation / seller-at-risk — plus the
// agent producing recommendation + mission proposals (nothing auto-executes).
// ============================================================================
import { buildScorecard } from "./scorecard";
import { listingAgent } from "./agent";
import { computeValuationView, NO_VALUATION, type ValuationInput } from "./valuation";
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
  matchCount: 6, avgMatchScore: 78, perfectMatchCount: 2, medianDomCity: 40, recentBuyerActivity: 3,
  market: { inventoryTrendPct: 2, concentrationLevel: "moderate", topSharePct: 30 },
  sellerLinked: true, valuationEstimate: 1_950_000, valuation: computeValuationView(2_000_000, val({ estimatedValue: 1_950_000, lowValue: 1_850_000, highValue: 2_050_000, confidence: 75, createdAt: iso(10) }), NOW),
  campaignActive: true, lastActivityAt: iso(2), openMissions: 1, truthScore: 70, ...over,
});
const val = (o: Partial<ValuationInput>): ValuationInput => ({ available: true, estimatedValue: 1_950_000, lowValue: 1_850_000, highValue: 2_050_000, confidence: 75, createdAt: iso(10), unavailableReason: null, ...o });

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

  // Overpriced — market-inferred only (valuation within range) → soft CMA, NOT lower price.
  const over = card({ price: 2_000_000, timeOnMarketDays: 80, listedAt: iso(80), matchCount: 1, avgMatchScore: 0, recentBuyerActivity: 0, updatedAt: iso(40), lastActivityAt: iso(40) });
  add("market-inferred overpriced → CMA not lower-price", hasRisk(over, "overpriced") && over.recommendations.some((r) => /סקירת מחיר|CMA/.test(r.action)) && !over.recommendations.some((r) => /הורד מחיר/.test(r.action)), "");

  // ── Valuation link scenarios (29.3.1) ───────────────────────────────────────
  const vsig = (price: number, o: Partial<ValuationInput>) => buildScorecard(sig({ price, valuation: computeValuationView(price, val(o), NOW) }), NOW);
  const noVal = buildScorecard(sig({ valuation: NO_VALUATION }), NOW);
  add("no valuation → missing risk + valuation review + honest reason", hasRisk(noVal, "missing_valuation") && noVal.recommendations.some((r) => /הערכת שווי/.test(r.action)) && noVal.valuation.unavailableReason != null, "");
  const staleVal = vsig(2_400_000, { createdAt: iso(200) });
  add("stale valuation → stale risk + no forced price drop", noVal.valuation.available === false && staleVal.risks.some((r) => r.type === "missing_valuation") && !staleVal.recommendations.some((r) => /הורד מחיר/.test(r.action)), `age ${staleVal.valuation.ageDays}`);
  // Valuation high + MARKET WEAK (slow DOM + weak demand) → lower price (two signals).
  const aboveWeak = buildScorecard(sig({ price: 2_400_000, timeOnMarketDays: 80, medianDomCity: 40, matchCount: 1, avgMatchScore: 0, recentBuyerActivity: 0, updatedAt: iso(40), lastActivityAt: iso(40), valuation: computeValuationView(2_400_000, val({ confidence: 80, createdAt: iso(10) }), NOW) }), NOW);
  add("valuation high + market weak → lower-price rec", aboveWeak.valuation.rangePosition === "above" && aboveWeak.recommendations.some((r) => /הורד מחיר/.test(r.action)), "");
  // Valuation high + MARKET STRONG (fast DOM + high demand) → hold, no cut (never one signal).
  const aboveStrong = buildScorecard(sig({ price: 2_400_000, timeOnMarketDays: 10, medianDomCity: 40, matchCount: 9, avgMatchScore: 82, recentBuyerActivity: 4, valuation: computeValuationView(2_400_000, val({ confidence: 80, createdAt: iso(10) }), NOW) }), NOW);
  add("valuation high + market strong → HOLD (no price cut)", aboveStrong.valuation.rangePosition === "above" && !aboveStrong.recommendations.some((r) => /הורד מחיר/.test(r.action)) && aboveStrong.recommendations.some((r) => /החזק מחיר/.test(r.action)), "");
  // Valuation low + MARKET STRONG → raise price.
  const belowStrong = buildScorecard(sig({ price: 1_700_000, timeOnMarketDays: 10, medianDomCity: 40, matchCount: 9, avgMatchScore: 82, recentBuyerActivity: 4, valuation: computeValuationView(1_700_000, val({ confidence: 80, createdAt: iso(10) }), NOW) }), NOW);
  add("valuation low + market strong → raise-price rec", belowStrong.valuation.rangePosition === "below" && belowStrong.recommendations.some((r) => /העלאת מחיר/.test(r.action)), "");
  const within = vsig(1_980_000, { confidence: 80, createdAt: iso(10) });
  add("asking within range → no price-change rec", within.valuation.rangePosition === "within" && !within.recommendations.some((r) => /הורד מחיר|העלאת מחיר/.test(r.action)), "");
  const lowConf = vsig(2_400_000, { confidence: 20, createdAt: iso(10) });
  add("low valuation confidence → no forced price drop", lowConf.valuation.rangePosition === "above" && !lowConf.valuation.strongEnoughForPricing && !lowConf.recommendations.some((r) => /הורד מחיר/.test(r.action)), lowConf.valuation.confidenceLabel);

  // Luxury.
  add("luxury classified", card({ price: 5_000_000 }).classification.includes("יוקרה"), "");

  // High demand.
  const demand = card({ matchCount: 9, avgMatchScore: 80, recentBuyerActivity: 4 });
  add("high demand opp + open house rec", demand.opportunities.some((o) => o.type === "high_demand") && hasRec(demand, /בית פתוח/), "");

  // No activity.
  const noact = card({ matchCount: 2, recentBuyerActivity: 0, updatedAt: iso(120), lastActivityAt: iso(120) });
  add("no activity risk + buyer follow-up", hasRisk(noact, "no_activity") && hasRec(noact, /חזור למתעניינים/), "");

  // Missing valuation.
  const noval = card({ valuation: NO_VALUATION });
  add("missing valuation risk + rec", hasRisk(noval, "missing_valuation") && hasRec(noval, /הערכת שווי/), "");

  // Seller at risk.
  const sellerRisk = card({ sellerLinked: true, timeOnMarketDays: 95, listedAt: iso(95), updatedAt: iso(95), lastActivityAt: iso(95), matchCount: 1, recentBuyerActivity: 0 });
  add("seller frustration risk + call seller", hasRisk(sellerRisk, "seller_frustration") && hasRec(sellerRisk, /התקשר למוכר/), "");

  // ── Market Performance scenarios (29.3.2) ───────────────────────────────────
  const base = card({});
  add("market performance full model", typeof base.marketPerformance.score === "number" && !!base.marketPerformance.domVsMarket.band && Array.isArray(base.marketPerformance.insights) && !!base.marketPerformance.marketPosition, "");
  const fast = card({ timeOnMarketDays: 15, medianDomCity: 40, matchCount: 7, avgMatchScore: 82, recentBuyerActivity: 3 });
  add("fast selling → band fast + above market", fast.marketPerformance.domVsMarket.band === "fast" && (fast.marketPerformance.marketPosition === "above" || fast.marketPerformance.score >= 65), `${fast.marketPerformance.score}`);
  const slow = card({ timeOnMarketDays: 110, medianDomCity: 40, matchCount: 1, recentBuyerActivity: 0, updatedAt: iso(100), lastActivityAt: iso(100) });
  add("slow listing → very_slow + below market + insight", (slow.marketPerformance.domVsMarket.band === "very_slow" || slow.marketPerformance.domVsMarket.band === "slow") && slow.marketPerformance.insights.some((i) => /איטית/.test(i.text)), slow.marketPerformance.domVsMarket.band);
  const hiComp = card({ market: { inventoryTrendPct: 12, concentrationLevel: "concentrated", topSharePct: 60 } });
  add("high competition → pressure + insight", hiComp.marketPerformance.competition.pressure >= 55 && hiComp.marketPerformance.insights.some((i) => /תחרות/.test(i.text)), `${hiComp.marketPerformance.competition.pressure}`);
  const loComp = card({ market: { inventoryTrendPct: 2, concentrationLevel: "fragmented", topSharePct: 20 } });
  add("low competition → lower pressure", loComp.marketPerformance.competition.pressure < hiComp.marketPerformance.competition.pressure, "");
  const strongDemand = card({ matchCount: 9, avgMatchScore: 82, perfectMatchCount: 4, recentBuyerActivity: 4 });
  add("strong demand → insight + high demand score", strongDemand.marketPerformance.insights.some((i) => /ביקוש קונים חזק/.test(i.text)) && strongDemand.marketPerformance.buyerDemand.demandScore >= 60, "");
  const weakDemand = card({ matchCount: 0, avgMatchScore: 0, perfectMatchCount: 0, recentBuyerActivity: 0, updatedAt: iso(60), lastActivityAt: iso(60) });
  add("weak demand → insight", weakDemand.marketPerformance.insights.some((i) => /ביקוש קונים חלש/.test(i.text)), "");
  add("market position + trend valid", ["above", "at", "below", "unknown"].includes(base.marketPerformance.marketPosition) && ["improving", "stable", "declining"].includes(base.marketPerformance.trend), "");

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
