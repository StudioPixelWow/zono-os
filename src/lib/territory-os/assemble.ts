// ============================================================================
// 🗺️ ZONO Territory Intelligence OS™ — pure assembler (client-safe). 39.0.
// Composes the EXISTING territory read models into one command center: overall
// territory score, neighborhood intelligence, street/building targeting, market
// share, a ranked acquisition plan, campaign suggestions, recommendations, 7/30/
// 90 plans and an executive view. Deterministic, evidence-only, no side effects.
// ============================================================================
import type {
  TerritoryInput, TerritoryOS, TerritoryScore, NeighborhoodCard, AcquisitionTarget,
  MarketShareView, ExecutiveView, CampaignSuggestion, TerritoryRecommendation, Priority, HeatLean,
} from "./types";
import { TERRITORY_OS_VERSION } from "./types";

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));
const priRank: Record<Priority, number> = { high: 3, medium: 2, low: 1 };

export function assembleTerritoryOS(input: TerritoryInput): TerritoryOS {
  const notes = [...input.notes];
  const s = input.dominationSummary;
  const heatByName = new Map(input.heat.map((h) => [h.name, h]));

  // ── Overall territory score ────────────────────────────────────────────────
  const shares = input.areas.map((a) => a.marketShare).filter((x): x is number => x != null);
  const avgShare = shares.length ? clamp(shares.reduce((p, c) => p + c, 0) / shares.length) : 0;
  const penetration = s.areas ? clamp((s.dominant / s.areas) * 100) : 0;
  const moments = input.areas.map((a) => a.momentum).filter((x): x is number => x != null);
  const growth = moments.length ? clamp(moments.reduce((p, c) => p + c, 0) / moments.length) : 50;
  const overall = clamp(s.avgScore);
  const band: TerritoryScore["band"] = overall >= 70 ? "dominant" : overall >= 50 ? "strong" : overall >= 30 ? "contested" : "weak";
  const score: TerritoryScore = {
    overall, coverage: clamp(s.coverage), marketShare: avgShare, penetration, growth, band,
    aiSummary: buildSummary(input, { overall, penetration, avgShare, growth, band }),
  };

  // ── Neighborhood intelligence ──────────────────────────────────────────────
  const neighborhoods: NeighborhoodCard[] = input.areas.slice(0, 30).map((a) => {
    const heat = heatByName.get(a.name);
    const rec = input.actions.find((x) => x.areaName === a.name);
    return {
      key: a.key, name: a.name, city: a.city, score: a.score, band: a.band,
      marketShare: a.marketShare, demand: a.demand, competition: a.competition, momentum: a.momentum,
      heatLevel: heat?.heatLevel ?? null, recommendation: rec?.title ?? null, evidence: a.evidence.slice(0, 3),
      href: `/market-domination`,
    };
  }).sort((x, y) => y.score - x.score);

  // ── Acquisition plan (streets + buildings + area actions, ranked) ──────────
  const acqStreets: AcquisitionTarget[] = input.streets.slice(0, 12).map((st) => ({
    kind: "street", label: `${st.street}${st.city ? ` · ${st.city}` : ""}`, city: st.city, score: st.recruitmentScore,
    priority: st.opportunity, why: st.aiRecommendation, evidence: st.evidence.slice(0, 3),
    ctaHref: "/distribution/campaign-wizard", ctaLabel: "גיוס",
  }));
  const acqBuildings: AcquisitionTarget[] = input.buildings.slice(0, 12).map((b) => ({
    kind: "building", label: `${b.label}${b.city ? ` · ${b.city}` : ""}`, city: b.city, score: b.opportunityScore,
    priority: b.recruitmentPriority, why: `${b.transactions} עסקאות · יוקרה ${b.luxuryScore}`, evidence: b.evidence.slice(0, 3),
    ctaHref: "/acquisition", ctaLabel: "פתח",
  }));
  const acqAreas: AcquisitionTarget[] = input.actions.filter((a) => a.kind.includes("acquisition") || a.kind.includes("no_listings") || a.kind.includes("opportunity")).slice(0, 8).map((a) => ({
    kind: "area", label: a.areaName, city: null, score: a.priority, priority: a.impact, why: a.why, evidence: a.evidence.slice(0, 3), ctaHref: a.ctaHref, ctaLabel: a.ctaLabel,
  }));
  const acquisitionPlan = [...acqStreets, ...acqBuildings, ...acqAreas]
    .sort((a, b) => priRank[b.priority] - priRank[a.priority] || b.score - a.score)
    .slice(0, 20);

  // ── Market share view ──────────────────────────────────────────────────────
  const marketShare: MarketShareView = {
    dominant: input.areas.filter((a) => a.band === "dominant" || a.score >= 70).slice(0, 8).map((a) => ({ name: a.name, share: a.marketShare })),
    weak: input.weakAreas.slice(0, 8).map((a) => ({ name: a.name, score: a.score })),
    missing: input.missingAreas.slice(0, 8).map((a) => ({ name: a.name })),
    expansion: input.topOpportunities.slice(0, 6).map((a) => ({ name: a.name, why: a.evidence[0] ?? "פוטנציאל צמיחה" })),
  };

  // ── Campaign suggestions (reuse existing marketing surfaces) ───────────────
  const campaigns = buildCampaigns(input);

  // ── Recommendations (from actions, evidence-only) ──────────────────────────
  const recommendations: TerritoryRecommendation[] = input.actions.slice(0, 8).map((a) => ({
    title: a.title, why: a.why, evidence: a.evidence.slice(0, 3), impact: a.impact, ctaHref: a.ctaHref, ctaLabel: a.ctaLabel,
  }));

  // ── Executive view ─────────────────────────────────────────────────────────
  const executive: ExecutiveView = {
    expansion: s.absent, penetration, growth, recruitment: input.streetSummary.highOpportunity,
    domination: s.dominant, weakTerritories: s.weak,
  };

  return {
    version: TERRITORY_OS_VERSION, city: input.city, generatedAt: new Date().toISOString(),
    score, neighborhoods, streets: input.streets.slice(0, 20), buildings: input.buildings.slice(0, 20),
    marketShare, acquisitionPlan, campaigns, recommendations, plans: input.plans, executive, notes,
  };
}

function buildSummary(input: TerritoryInput, m: { overall: number; penetration: number; avgShare: number; growth: number; band: string }): string {
  const parts: string[] = [];
  parts.push(`ציון טריטוריה ${m.overall} (${m.band === "dominant" ? "שליטה" : m.band === "strong" ? "חזק" : m.band === "contested" ? "מעורער" : "חלש"})`);
  parts.push(`נתח שוק ממוצע ${m.avgShare}%`);
  if (input.streetSummary.highOpportunity > 0) parts.push(`${input.streetSummary.highOpportunity} רחובות בהזדמנות גבוהה לגיוס`);
  if (input.dominationSummary.weak > 0) parts.push(`${input.dominationSummary.weak} אזורים חלשים לחיזוק`);
  if (input.dominationSummary.absent > 0) parts.push(`${input.dominationSummary.absent} אזורי הרחבה ללא נוכחות`);
  return parts.join(" · ") + ".";
}

function buildCampaigns(input: TerritoryInput): CampaignSuggestion[] {
  const out: CampaignSuggestion[] = [];
  if (input.streets.some((s) => s.opportunity === "high")) out.push({ title: "קמפיין גיוס מוכרים ברחובות חמים", type: "seller", href: "/distribution/campaign-wizard", why: "רחובות עם פעילות עסקאות גבוהה ונתח נמוך שלנו" });
  if (input.weakAreas.length) out.push({ title: `קמפיין שכונה ל${input.weakAreas[0].name}`, type: "neighborhood", href: "/facebook", why: "חיזוק נוכחות באזור חלש" });
  if (input.missingAreas.length) out.push({ title: `דף נחיתה לאזור ${input.missingAreas[0].name}`, type: "landing", href: `/l/OFFICE/area`, why: "כניסה לאזור ללא נוכחות" });
  if (input.buildings.some((b) => b.luxuryScore >= 40)) out.push({ title: "קמפיין יוקרה לבניינים נבחרים", type: "luxury", href: "/facebook", why: "בניינים עם ציון יוקרה גבוה" });
  return out.slice(0, 6);
}

/** Merge heat into an area name (helper reused by the service). */
export function mergeHeat(name: string, heat: HeatLean[]): HeatLean | null {
  return heat.find((h) => h.name === name) ?? null;
}
