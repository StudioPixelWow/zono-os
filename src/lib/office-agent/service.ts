// ============================================================================
// 🏢 ZONO Office Growth Agent™ — service (server-only). 29.7.
// Assembles ONE brokerage-level signal set by REUSING the Chief of Staff (org
// score + market + missions), the Offices Index (offices/brokers/cities), the
// four CRM Agent scorecards (listing/buyer/seller/lead pipelines), Broker
// Intelligence (office broker ranking), Competitive Intelligence (city dashboard)
// and Territory Intelligence (office strong/weak areas) — then builds the Office
// Growth Scorecard and exposes signals for the agent runtime. Read-only;
// evidence-only; recommendations are approval-gated; nothing auto-executes.
// ============================================================================
import "server-only";
import { getChiefOfStaff } from "@/lib/chief-of-staff";
import { getBrokerageOfficesIndex } from "@/lib/brokerage-data/office-profile";
import { getListingScorecards } from "@/lib/listing-agent";
import { getBuyerAgentScorecards } from "@/lib/buyer-agent";
import { getSellerAgentScorecards } from "@/lib/seller-agent";
import { getLeadAgentScorecards } from "@/lib/lead-agent";
import { getOfficeBrokerRanking } from "@/lib/brokerage-data/broker-intelligence";
import { getCityCompetitiveDashboard } from "@/lib/brokerage-data/competitive-intelligence";
import { getOfficeTerritory } from "@/lib/brokerage-data/territory-intelligence";
import { buildOfficeScorecard } from "./scorecard";
import type { OfficeSignals, OfficeScorecard, BrokerCard, CityInventory, CompetitorMove, AreaOpportunity } from "./types";

const COMMERCIAL_KW = ["מסחר", "משרד", "חנות", "מחסן", "commercial", "office", "shop", "store"];

async function assemble(orgId: string | null): Promise<{ signals: OfficeSignals; notes: string[] }> {
  const notes: string[] = [];
  const [cos, idx, listings, buyers, sellers, leads] = await Promise.all([
    getChiefOfStaff(orgId).catch(() => null),
    getBrokerageOfficesIndex().catch(() => null),
    getListingScorecards(orgId).catch(() => null),
    getBuyerAgentScorecards(orgId).catch(() => null),
    getSellerAgentScorecards(orgId).catch(() => null),
    getLeadAgentScorecards(orgId).catch(() => null),
  ]);

  const org = cos?.globalContext.organization ?? { offices: idx?.totals.offices ?? 0, brokers: idx?.totals.agents ?? 0, activeListings: idx?.totals.listings ?? 0, activeCities: idx?.cities.length ?? 0, brands: idx?.brands.length ?? 0 };
  const mkt = cos?.globalContext.market ?? { avgBusinessScore: 0, avgConfidence: 0, decliningCities: 0, cities: [] as unknown[] };
  const m = cos?.globalContext.missions ?? { active: 0, completed: 0, cancelled: 0, blocked: 0, waiting: 0, inProgress: 0, executionScore: 0, completionRatePct: 0 };

  // Per-city listing distribution (Offices Index).
  const cityMap = new Map<string, number>();
  for (const o of idx?.offices ?? []) { const c = o.city?.trim(); if (c) cityMap.set(c, (cityMap.get(c) ?? 0) + o.listingCount); }
  const cityInventory: CityInventory[] = [...cityMap.entries()].map(([city, listings]) => ({ city, listings })).sort((a, b) => b.listings - a.listings);

  // Commercial inventory (evidence: keyword match over listing scorecards).
  const commercialListings = (listings?.scorecards ?? []).filter((c) => {
    const hay = `${c.title ?? ""} ${(c.classification ?? []).join(" ")}`.toLowerCase();
    return COMMERCIAL_KW.some((k) => hay.includes(k));
  }).length;

  // Broker ranking for the largest office (Broker Intelligence reuse).
  const topOffice = [...(idx?.offices ?? [])].sort((a, b) => b.listingCount - a.listingCount)[0] ?? null;
  let brokerCards: BrokerCard[] = [];
  if (topOffice) {
    try {
      const ranking = await getOfficeBrokerRanking(topOffice.id);
      brokerCards = ranking.slice(0, 12).map((b) => ({ name: b.name, status: b.status, activeListings: b.activeListings, recentListings: b.recentListings, office: topOffice.name }));
    } catch { /* ranking unavailable */ }
  }

  // Competitive + territory for the top city (aggregate a single primary city).
  const primaryCity = topOffice?.city ?? (idx?.cities ?? [])[0] ?? null;
  let growingCompetitors: CompetitorMove[] = [], decliningCompetitors: CompetitorMove[] = [], emergingAreas: AreaOpportunity[] = [];
  let inventoryTrendPct = 0, topOfficeSharePct = 0, marketConcentration = 0;
  let strongAreas: string[] = [], weakAreas: string[] = [];
  if (primaryCity) {
    const [dash, terr] = await Promise.all([
      getCityCompetitiveDashboard(primaryCity).catch(() => null),
      topOffice ? getOfficeTerritory(topOffice.id, primaryCity).catch(() => null) : Promise.resolve(null),
    ]);
    if (dash) {
      inventoryTrendPct = dash.snapshot.inventoryTrendPct;
      topOfficeSharePct = dash.snapshot.topOfficeSharePct;
      marketConcentration = dash.snapshot.marketConcentration;
      growingCompetitors = dash.topGrowing.slice(0, 4).map((g) => ({ name: g.officeName, city: dash.city, growthPct: g.growthPct }));
      decliningCompetitors = dash.topDeclining.slice(0, 3).map((g) => ({ name: g.officeName, city: dash.city, growthPct: g.growthPct }));
      emergingAreas = dash.emergingAreas.slice(0, 3).map((a) => ({ title: a.title, area: a.area, evidence: a.evidence }));
    }
    if (terr) {
      strongAreas = terr.strongAreas.slice(0, 4).map((a) => a.name);
      weakAreas = terr.weakAreas.slice(0, 4).map((a) => a.name);
    }
  }

  const signals: OfficeSignals = {
    id: orgId ?? "org", name: idx?.brands[0] ?? "המשרד שלי",
    offices: org.offices, brokers: org.brokers, activeListings: org.activeListings, activeCities: org.activeCities, brands: org.brands,
    agentsWithOffice: idx?.totals.agents ?? 0,
    dataQualityScore: cos?.globalContext.dataQuality.score ?? 0,
    businessScore: cos?.briefing.businessScore ?? 0, executionScore: cos?.briefing.executionScore ?? 0, aiConfidence: cos?.briefing.aiConfidence ?? 0,
    avgBusinessScore: mkt.avgBusinessScore, avgConfidence: mkt.avgConfidence, citiesAnalyzed: (mkt.cities as unknown[]).length, decliningCities: mkt.decliningCities,
    missions: { active: m.active, completed: m.completed, cancelled: m.cancelled, blocked: m.blocked, waiting: m.waiting, inProgress: m.inProgress, executionScore: m.executionScore, completionRatePct: m.completionRatePct },
    buyerPipeline: { total: buyers?.totals.buyers ?? 0, hot: buyers?.totals.hot ?? 0, cold: buyers?.totals.cold ?? 0, closing: buyers?.totals.closing ?? 0, withMatches: buyers?.totals.withMatches ?? 0 },
    sellerPipeline: { total: sellers?.totals.sellers ?? 0, hot: sellers?.totals.hot ?? 0, atRisk: sellers?.totals.atRisk ?? 0, readyToSign: sellers?.totals.readyToSign ?? 0, priceIssues: sellers?.totals.priceIssues ?? 0, withBuyers: sellers?.totals.withBuyers ?? 0 },
    leadPipeline: { total: leads?.totals.leads ?? 0, hot: leads?.totals.hot ?? 0, duplicates: leads?.totals.duplicates ?? 0, convertReady: leads?.totals.convertReady ?? 0, nurture: leads?.totals.nurture ?? 0, humanReview: leads?.totals.humanReview ?? 0 },
    listingPipeline: { total: listings?.totals.properties ?? 0, healthy: listings?.totals.healthy ?? 0, critical: listings?.totals.critical ?? 0, luxury: listings?.totals.luxury ?? 0, stale: listings?.totals.stale ?? 0, highOpportunity: listings?.totals.highOpportunity ?? 0 },
    cityInventory, commercialListings,
    brokerCards,
    competitive: { growingCompetitors, decliningCompetitors, inventoryTrendPct, emergingAreas, topOfficeSharePct, marketConcentration },
    strongAreas, weakAreas,
    truthScore: cos?.globalContext.dataQuality.score ?? null,
  };

  if (signals.offices === 0 && signals.brokers === 0) notes.push("אין משרדים/מתווכים מקושרים עדיין — צור/שייך נתונים כדי להפעיל את סוכן צמיחת המשרד. אין המצאות.");
  if (signals.citiesAnalyzed === 0) notes.push("לא נותחו ערים — אותות תחרות/טריטוריה חלקיים.");
  return { signals, notes };
}

/** Signals for the agent runtime (injected into the framework context). */
export async function getOfficeAgentSignals(orgId: string | null): Promise<OfficeSignals[]> {
  try { return [(await assemble(orgId)).signals]; } catch { return []; }
}

export interface OfficeGrowthOverview {
  version: string; generatedAt: string;
  scorecard: OfficeScorecard | null; notes: string[];
}

/** The single Office Growth Scorecard for the brokerage (dashboard). */
export async function getOfficeGrowthScorecard(orgId: string | null): Promise<OfficeGrowthOverview> {
  const { signals, notes } = await assemble(orgId);
  return { version: "29.7", generatedAt: new Date().toISOString(), scorecard: buildOfficeScorecard(signals), notes };
}
