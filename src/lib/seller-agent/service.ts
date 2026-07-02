// ============================================================================
// 🏷️ Seller Intelligence Agent — service (server-only). 29.5.
// Assembles seller signals by REUSING the Seller Digital Twin (getSellerTwins),
// the Listing Intelligence Agent's property+valuation+market scorecard, buyer↔
// property matches, the Unified Customer Journey and the sellers read model
// (price flexibility) — then builds one seller scorecard each and exposes signals
// for the agent runtime. Read-only; evidence-only; nothing auto-executes.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSellerTwins, type SellerTwin } from "@/lib/digital-twin/sellers";
import { getListingScorecards } from "@/lib/listing-agent";
import { getCustomerJourneys } from "@/lib/digital-twin/customer";
import { buildSellerScorecard } from "./scorecard";
import type { SellerSignals, PropertyIntel, BuyerMatchInput, SellerScorecard } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : null; };
const NO_PROP: PropertyIntel = { hasProperty: false, propertyId: null, status: null, askingPrice: null, valuationPosition: "unknown", valuationConfidence: "none", priceGapPct: null, marketScore: null, domBand: null, pricingHealth: null, competitionPressure: null, buyerDemandScore: null, timeOnMarketDays: null, campaignActive: null };

async function assemble(orgId: string | null, limit: number): Promise<{ signals: SellerSignals[]; notes: string[] }> {
  const notes: string[] = [];
  const [overview, listingsO, journeys] = await Promise.all([
    getSellerTwins(orgId).catch(() => null),
    getListingScorecards(orgId).catch(() => null),
    getCustomerJourneys(orgId).catch(() => null),
  ]);
  const twins: SellerTwin[] = (overview?.twins ?? []).slice(0, limit);
  if (!twins.length) { notes.push("אין מוכרים במערכת עדיין — צור מוכרים כדי להפעיל את סוכן המוכרים."); return { signals: [], notes }; }

  // Property intel by property id (from the Listing Agent scorecard).
  const propIntel = new Map<string, PropertyIntel>();
  for (const c of listingsO?.scorecards ?? []) {
    propIntel.set(c.id, {
      hasProperty: true, propertyId: c.id, status: c.status, askingPrice: c.price,
      valuationPosition: c.valuation.rangePosition, valuationConfidence: c.valuation.confidenceLabel, priceGapPct: c.valuation.priceGapPct,
      marketScore: c.marketPerformance.score, domBand: c.marketPerformance.domVsMarket.band, pricingHealth: c.health.pricingHealth,
      competitionPressure: c.health.competitionPressure, buyerDemandScore: c.marketPerformance.buyerDemand.demandScore,
      timeOnMarketDays: c.marketPerformance.domVsMarket.days, campaignActive: null,
    });
  }

  // Seller row extras (price flexibility, signed) + buyer matches per property.
  const db = await createClient();
  const sellerIds = twins.map((t) => t.identity.id);
  const flexById = new Map<string, { flex: number | null; signed: boolean }>();
  try { for (const r of ((await db.from("sellers").select("id,negotiation_flexibility_score,has_signed_agreement").in("id", sellerIds)).data ?? []) as Row[]) { const id = s(r.id); if (id) flexById.set(id, { flex: num(r.negotiation_flexibility_score), signed: !!r.has_signed_agreement }); } } catch { /* none */ }

  const propIds = twins.map((t) => s((t.profile as unknown as Row).propertyLink)).filter((x): x is string => !!x);
  const buyersByProp = new Map<string, BuyerMatchInput[]>();
  if (propIds.length) {
    try { for (const m of ((await db.from("buyer_property_matches" as never).select("buyer_id,linked_property_id,match_score").in("linked_property_id" as never, propIds as never).limit(3000)).data ?? []) as Row[]) { const pid = s(m.linked_property_id), bid = s(m.buyer_id); if (!pid || !bid) continue; (buyersByProp.get(pid) ?? buyersByProp.set(pid, []).get(pid)!).push({ buyerId: bid, name: `קונה ${bid.slice(0, 8)}`, score: num(m.match_score) ?? 0 }); } } catch { /* none */ }
  }

  // Customer journey roles.
  const roleBySeller = new Map<string, { roles: string[]; stage: string | null }>();
  for (const j of journeys?.journeys ?? []) for (const mem of j.identity.members) if (mem.kind === "seller") roleBySeller.set(mem.id, { roles: j.identity.roles, stage: j.currentStage });

  const signals: SellerSignals[] = twins.map((t) => {
    const p = t.profile; const extra = flexById.get(t.identity.id); const jr = roleBySeller.get(t.identity.id);
    const propertyId = p.propertyLink;
    const property = propertyId ? propIntel.get(propertyId) ?? { ...NO_PROP, hasProperty: true, propertyId } : NO_PROP;
    const strongest = (t.relationships?.strongest ?? []).filter((e) => e.type === "works_at" || e.type === "managed_by" || e.type === "represents").map((e) => e.to);
    return {
      id: t.identity.id, name: t.identity.name,
      motivation: p.motivation, trust: p.trust, priceExpectation: p.priceExpectation, priceGapPct: p.priceGapPct,
      urgency: p.urgency, readinessToSign: p.readinessToSign, churnRisk: p.churnRisk, sellerConfidence: p.sellerConfidence,
      communicationHealth: p.communicationHealth, completeness: p.completeness, decisionStyle: p.decisionStyle,
      priceFlexibility: extra?.flex ?? null, hasSignedAgreement: extra?.signed || t.classification.includes("חתום") || p.behavior.agreements > 0, objections: p.objections,
      behavior: p.behavior,
      healthScore: t.health.score, healthLabel: t.health.label, recencyScore: t.memory.recencyScore, engagementScore: t.memory.engagementScore,
      totalActivities: t.memory.totalActivities, lastActivityAt: t.memory.lastActivityAt,
      relationshipDegree: t.relationships?.degree ?? 0, brokerConnections: strongest,
      classification: t.classification, learnings: t.learnings.map((l) => l.type),
      lifecycleRoles: jr?.roles ?? [], repeatSeller: (jr?.roles ?? []).includes("repeat_client"), formerBuyer: (jr?.roles ?? []).includes("buyer"),
      investor: t.classification.includes("משקיע") || (jr?.roles ?? []).includes("investor"), lifecycleStage: jr?.stage ?? null,
      property, matchingBuyers: propertyId ? buyersByProp.get(propertyId) ?? [] : [], truthScore: t.truth?.truthScore ?? null,
    };
  });
  return { signals, notes };
}

/** Signals for the agent runtime (injected into the framework context). */
export async function getSellerAgentSignals(orgId: string | null, limit = 20): Promise<SellerSignals[]> {
  try { return (await assemble(orgId, limit)).signals; } catch { return []; }
}

export interface SellerAgentScorecardsOverview {
  version: string; generatedAt: string;
  totals: { sellers: number; hot: number; atRisk: number; readyToSign: number; priceIssues: number; withBuyers: number; luxury: number };
  scorecards: SellerScorecard[]; notes: string[];
}

/** One seller scorecard per seller (dashboard). */
export async function getSellerAgentScorecards(orgId: string | null, limit = 30): Promise<SellerAgentScorecardsOverview> {
  const { signals, notes } = await assemble(orgId, limit);
  const scorecards = signals.map(buildSellerScorecard);
  return {
    version: "29.5", generatedAt: new Date().toISOString(),
    totals: {
      sellers: scorecards.length,
      hot: scorecards.filter((c) => c.health.label === "בריא" && c.health.motivation >= 60).length,
      atRisk: scorecards.filter((c) => c.health.churnRisk >= 55 || c.health.label === "בסיכון").length,
      readyToSign: scorecards.filter((c) => c.strategy.recommendedStrategy === "AGREEMENT").length,
      priceIssues: scorecards.filter((c) => ["PRICE_REDUCTION", "PRICE_ALIGNMENT"].includes(c.strategy.recommendedStrategy)).length,
      withBuyers: scorecards.filter((c) => c.buyerConnection.priorityBuyers.length > 0).length,
      luxury: scorecards.filter((c) => c.classification.includes("יוקרה")).length,
    },
    scorecards: [...scorecards].sort((a, b) => b.strategy.confidence - a.strategy.confidence),
    notes,
  };
}
