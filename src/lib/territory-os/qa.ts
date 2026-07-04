// ============================================================================
// ✅ ZONO Territory Intelligence OS™ — pure self-tests (offline). 39.0.
// Validates the score, neighborhood composition, acquisition ranking, market
// share view, campaigns, recommendations, executive view. No I/O.
// ============================================================================
import { assembleTerritoryOS } from "./assemble";
import type { TerritoryInput } from "./types";

export interface TCheck { name: string; pass: boolean; detail: string }
export interface TSelfCheck { ok: boolean; total: number; passed: number; checks: TCheck[] }

function base(o: Partial<TerritoryInput> = {}): TerritoryInput {
  return {
    city: "חיפה",
    dominationSummary: { areas: 5, avgScore: 62, dominant: 2, contested: 1, weak: 1, absent: 1, coverage: 70 },
    areas: [
      { key: "carmel", name: "כרמל", city: "חיפה", score: 82, band: "dominant", marketShare: 40, demand: 80, competition: 30, momentum: 70, evidence: ["8 עסקאות"] },
      { key: "hadar", name: "הדר", city: "חיפה", score: 45, band: "contested", marketShare: 15, demand: 55, competition: 60, momentum: 40, evidence: ["מתחרים חזקים"] },
    ],
    topOpportunities: [{ key: "hadar", name: "הדר", city: "חיפה", score: 45, band: "contested", marketShare: 15, demand: 55, competition: 60, momentum: 40, evidence: ["ביקוש עולה"] }],
    weakAreas: [{ key: "hadar", name: "הדר", city: "חיפה", score: 45, band: "contested", marketShare: 15, demand: 55, competition: 60, momentum: 40, evidence: [] }],
    missingAreas: [{ key: "neve", name: "נווה שאנן", city: "חיפה", score: 0, band: "absent", marketShare: 0, demand: null, competition: null, momentum: null, evidence: [] }],
    actions: [
      { areaName: "הדר", kind: "growing_demand", title: "חזק נוכחות בהדר", why: "ביקוש עולה", evidence: ["+20% ביקוש"], priority: 80, impact: "high", ctaHref: "/distribution/groups", ctaLabel: "הוסף קבוצות" },
      { areaName: "כרמל", kind: "luxury_opportunity", title: "הזדמנות יוקרה בכרמל", why: "עסקאות יוקרה", evidence: ["3 עסקאות יוקרה"], priority: 70, impact: "medium", ctaHref: "/acquisition", ctaLabel: "פעל" },
    ],
    plans: [{ horizon: "7d", label: "7 ימים", tasks: [{ area: "הדר", task: "פרסם בקבוצות" }] }, { horizon: "30d", label: "30 יום", tasks: [] }, { horizon: "90d", label: "90 יום", tasks: [] }],
    streets: [
      { key: "herzl", city: "חיפה", street: "הרצל", recruitmentScore: 88, opportunity: "high", transactions: 6, marketShare: 10, aiRecommendation: "גיוס אקטיבי", evidence: ["6 עסקאות"] },
      { key: "balfour", city: "חיפה", street: "בלפור", recruitmentScore: 40, opportunity: "low", transactions: 1, marketShare: 50, aiRecommendation: "מעקב", evidence: [] },
    ],
    buildings: [{ key: "10-5", label: "גוש 10 חלקה 5", city: "חיפה", recruitmentPriority: "high", opportunityScore: 75, luxuryScore: 60, transactions: 4, evidence: ["4 עסקאות"] }],
    streetSummary: { streets: 2, buildings: 1, activeStreets: 2, highOpportunity: 1, avgRecruitment: 64 },
    heat: [{ name: "כרמל", demand: 80, supply: 30, opportunity: 70, heatLevel: "hot" }],
    notes: [],
    ...o,
  };
}

export function runSelfCheck(): TSelfCheck {
  const checks: TCheck[] = [];
  const add = (n: string, p: boolean, d = "") => checks.push({ name: n, pass: p, detail: d });
  const t = assembleTerritoryOS(base());

  add("score overall from domination avg", t.score.overall === 62 && t.score.band === "strong");
  add("score coverage/share/penetration/growth", t.score.coverage === 70 && t.score.marketShare === Math.round((40 + 15) / 2) && t.score.penetration === 40 && t.score.growth === Math.round((70 + 40) / 2));
  add("AI summary mentions score", t.score.aiSummary.includes("ציון טריטוריה 62"));

  add("neighborhoods sorted by score + heat merged", t.neighborhoods[0].name === "כרמל" && t.neighborhoods[0].heatLevel === "hot");
  add("neighborhood recommendation from action", t.neighborhoods.find((n) => n.name === "הדר")!.recommendation === "חזק נוכחות בהדר");

  add("acquisition plan merges streets+buildings+areas", t.acquisitionPlan.some((a) => a.kind === "street") && t.acquisitionPlan.some((a) => a.kind === "building") && t.acquisitionPlan.some((a) => a.kind === "area"));
  add("acquisition high priority first", t.acquisitionPlan[0].priority === "high");
  add("street targets carry cta", t.acquisitionPlan.find((a) => a.kind === "street")!.ctaLabel === "גיוס");

  add("market share dominant/weak/missing/expansion", t.marketShare.dominant.some((d) => d.name === "כרמל") && t.marketShare.weak.some((w) => w.name === "הדר") && t.marketShare.missing.some((m) => m.name === "נווה שאנן") && t.marketShare.expansion.length === 1);

  add("campaigns suggested (hot street + weak area + missing + luxury)", t.campaigns.length >= 3 && t.campaigns.some((c) => c.type === "seller") && t.campaigns.some((c) => c.type === "luxury"));
  add("recommendations from actions with evidence", t.recommendations.length === 2 && t.recommendations[0].evidence.length > 0);
  add("executive view", t.executive.domination === 2 && t.executive.weakTerritories === 1 && t.executive.expansion === 1 && t.executive.recruitment === 1);
  add("plans 7/30/90 passthrough", t.plans.length === 3 && t.plans[0].horizon === "7d");
  add("streets/buildings capped passthrough", t.streets.length === 2 && t.buildings.length === 1);

  const empty = assembleTerritoryOS(base({ areas: [], topOpportunities: [], weakAreas: [], missingAreas: [], actions: [], streets: [], buildings: [], heat: [], dominationSummary: { areas: 0, avgScore: 0, dominant: 0, contested: 0, weak: 0, absent: 0, coverage: 0 } }));
  add("empty-safe", empty.neighborhoods.length === 0 && empty.acquisitionPlan.length === 0 && empty.score.overall === 0 && empty.score.band === "weak");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
