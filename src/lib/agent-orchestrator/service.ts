// ============================================================================
// 🕸️ ZONO Multi-Agent Orchestrator™ — service (server-only). 29.8.
// Gathers EVERY agent scorecard (listing/buyer/seller/lead/office) read-only,
// normalizes them into the OrchestratorInput, then builds the Multi-Agent
// Dashboard (events → reactions → chains → priority → conflicts → plans).
// No agent modified; no business logic duplicated; nothing auto-executes.
// ============================================================================
import "server-only";
import { getListingScorecards } from "@/lib/listing-agent";
import { getBuyerAgentScorecards } from "@/lib/buyer-agent";
import { getSellerAgentScorecards } from "@/lib/seller-agent";
import { getLeadAgentScorecards } from "@/lib/lead-agent";
import { getOfficeGrowthScorecard } from "@/lib/office-agent";
import { buildOrchestratorDashboard } from "./orchestrator";
import type { OrchestratorInput, OrchestratorDashboard, OBuyer, OSeller, OListing, OLead, OOffice, Stance, Impact } from "./types";

const buyerStance = (s: string): Stance => (["WAIT", "LONG_TERM_NURTURE", "COLLECT_INFORMATION"].includes(s) ? "wait" : "proceed");
const sellerStance = (s: string): Stance => (["AGREEMENT", "NEGOTIATE", "OPEN_HOUSE", "LAUNCH_MARKETING"].includes(s) ? "sell_now" : ["PRICE_REDUCTION", "PRICE_ALIGNMENT"].includes(s) ? "reduce_price" : "hold");
const listingStance = (s: string): Stance => (s === "reduce_price" ? "reduce_price" : "keep");
const impactOf = (conf: number): Impact => (conf >= 72 ? "high" : conf >= 50 ? "medium" : "low");

async function assemble(orgId: string | null): Promise<{ input: OrchestratorInput; notes: string[] }> {
  const notes: string[] = [];
  const [listingsO, buyersO, sellersO, leadsO, officeO] = await Promise.all([
    getListingScorecards(orgId).catch(() => null),
    getBuyerAgentScorecards(orgId).catch(() => null),
    getSellerAgentScorecards(orgId).catch(() => null),
    getLeadAgentScorecards(orgId).catch(() => null),
    getOfficeGrowthScorecard(orgId).catch(() => null),
  ]);

  const buyers: OBuyer[] = (buyersO?.scorecards ?? []).map((c) => {
    const strat = c.strategy.recommendedStrategy as string;
    const hot = (c.health.label === "בריא" && c.health.buyingConfidence >= 60) || ["NEGOTIATE", "BOOK_VISIT", "BOOK_SECOND_VISIT", "SEND_PROPERTIES"].includes(strat);
    const closing = ["CLOSE_DEAL", "LAWYER_STAGE"].includes(strat);
    const matchListingIds = [...c.matchIntel.perfect, ...c.matchIntel.emerging].map((m) => m.listingId).filter(Boolean);
    return { id: c.id, name: c.name, hot, closing, strategy: c.aiRecommendation.split(" ")[0] || strat, stance: buyerStance(strat), impact: impactOf(c.aiConfidence), confidence: c.aiConfidence, truth: c.truthScore ?? 55, matchListingIds };
  });

  const sellers: OSeller[] = (sellersO?.scorecards ?? []).map((c) => {
    const strat = c.strategy.recommendedStrategy as string;
    const ready = strat === "AGREEMENT";
    const atRisk = c.health.churnRisk >= 55 || c.health.label === "בסיכון";
    const priceIssue = ["PRICE_REDUCTION", "PRICE_ALIGNMENT"].includes(strat);
    const propertyHealthy = (c.property.pricingHealth ?? 50) >= 55 || c.property.valuationPosition === "within" || c.property.valuationPosition === "below";
    const matchingBuyerIds = [...c.buyerConnection.priorityBuyers, ...c.buyerConnection.matchingBuyers].map((b) => b.buyerId).filter(Boolean);
    return { id: c.id, name: c.name, ready, atRisk, priceIssue, strategy: strat, stance: sellerStance(strat), impact: impactOf(c.aiConfidence), confidence: c.aiConfidence, truth: c.truthScore ?? 55, propertyId: c.property.propertyId, propertyHealthy, marketScore: c.property.marketScore, matchingBuyerIds };
  });

  const listings: OListing[] = (listingsO?.scorecards ?? []).map((c) => {
    const strat = c.strategy.recommendedStrategy as string;
    const stale = c.classification.includes("מתיישן");
    const critical = c.health.label === "קריטי" || c.classification.includes("קריטי");
    const healthy = c.health.label === "בריא";
    const overpriced = strat === "reduce_price" || c.valuation.rangePosition === "above";
    return { id: c.id, name: c.title, city: c.city, stale, critical, healthy, overpriced, strategy: strat, stance: listingStance(strat), impact: impactOf(c.aiConfidence), confidence: c.aiConfidence, truth: c.truthScore ?? 55 };
  });

  const leads: OLead[] = (leadsO?.scorecards ?? []).map((c) => ({
    id: c.id, name: c.name, duplicate: c.routing.target === "duplicate_review" || c.risks.some((r) => r.type === "duplicate_lead"),
    hot: c.opportunities.some((o) => o.type === "hot_lead"), convertReady: ["CONVERT_TO_BUYER", "CONVERT_TO_SELLER", "CONVERT_TO_BOTH"].includes(c.strategy.recommendedStrategy), routing: c.routing.target,
  }));

  let office: OOffice | null = null;
  const oc = officeO?.scorecard ?? null;
  if (oc) office = {
    name: oc.name, strategy: oc.strategy.recommendedStrategy, strategyHe: oc.aiRecommendation.split(" — ")[0] || oc.strategy.recommendedStrategy, confidence: oc.aiConfidence,
    marketShiftPct: 0, // conservative: market-shift events are driven by competitive findings below
    territoryChanged: oc.competitive.some((f) => f.type === "expansion_opportunity" || f.type === "territory_opportunity"),
    inactiveBrokers: oc.brokerFindings.filter((f) => f.type === "inactive_broker").flatMap((f) => f.evidence).slice(0, 5),
    decisions: oc.decisions.slice(0, 6).map((d) => ({ type: d.type, title: d.title, impact: d.impact, why: d.why })),
    risks: oc.risks.map((r) => ({ title: r.title, severity: r.severity })),
    missionsCompleted: 0,
  };
  // Derive market shift from the office's lost-market-share / competitive signal (evidence-only).
  if (office && oc) {
    const lost = oc.competitive.find((f) => f.type === "lost_market_share");
    if (lost) { const m = /(-?\d+)%/.exec(lost.evidence.join(" ")); if (m) office.marketShiftPct = Number(m[1]); }
  }

  if (!buyers.length && !sellers.length && !listings.length && !leads.length && !office) notes.push("אין נתוני סוכנים עדיין — הפעל את הסוכנים כדי לייצר אירועים והזדמנויות. אין המצאות.");
  return { input: { buyers, sellers, listings, leads, office }, notes };
}

export interface OrchestratorOverview extends OrchestratorDashboard { serviceNotes: string[] }

/** Build the Multi-Agent Dashboard for the org (reuses every agent scorecard). */
export async function getOrchestratorDashboard(orgId: string | null): Promise<OrchestratorOverview> {
  const { input, notes } = await assemble(orgId);
  const dash = buildOrchestratorDashboard(input);
  return { ...dash, notes: [...notes, ...dash.notes], serviceNotes: notes };
}
