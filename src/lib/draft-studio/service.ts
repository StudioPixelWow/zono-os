// ============================================================================
// ✉️ ZONO — Draft Studio — service (server-only). 30.3. Parts 3 + 5.
// Assembles the normalized CommContext for an entity by REUSING the existing
// agent scorecards read-only (buyer/seller/lead/listing/office), then builds the
// approval-gated draft bundle with the pure generator. No engine modified; no
// business logic duplicated; nothing is ever sent.
// ============================================================================
import "server-only";
import { getBuyerAgentScorecards } from "@/lib/buyer-agent";
import { getSellerAgentScorecards } from "@/lib/seller-agent";
import { getLeadAgentScorecards } from "@/lib/lead-agent";
import { getListingScorecards } from "@/lib/listing-agent";
import { getOfficeGrowthScorecard } from "@/lib/office-agent";
import { buildDraftBundle } from "./generate";
import type { CommContext, DraftRequest, DraftBundle, DraftTarget, DraftSender } from "./types";

function base(target: DraftTarget, sender: DraftSender): CommContext {
  return {
    entityKind: target.entityKind, entityId: target.entityId, name: target.name,
    firstName: (target.name || "").trim().split(/\s+/)[0] || target.name,
    brokerName: sender.brokerName, officeName: sender.officeName,
    journeyStage: null, trust: null, relationshipPath: [], truthScore: null,
    recommendation: null, strategy: null, reason: null, missionGoal: null, lastActivity: null,
    facts: [], preferences: [], propertyTitle: null, price: null,
  };
}

async function enrich(orgId: string | null, target: DraftTarget, ctx: CommContext): Promise<CommContext> {
  try {
    switch (target.entityKind) {
      case "buyer": case "customer": {
        const o = await getBuyerAgentScorecards(orgId).catch(() => null);
        const c = o?.scorecards.find((x) => x.id === target.entityId);
        if (c) return { ...ctx, name: c.name, firstName: c.name.split(/\s+/)[0] || c.name, journeyStage: c.lifecycleStage, trust: c.health.trust, truthScore: c.truthScore, recommendation: c.aiRecommendation, strategy: c.strategy.recommendedStrategy, facts: [...c.matchIntel.perfect.slice(0, 2).map((m) => `התאמה: ${m.title}`), ...c.classification.slice(0, 2)], preferences: c.classification.slice(0, 3) };
        break;
      }
      case "seller": {
        const o = await getSellerAgentScorecards(orgId).catch(() => null);
        const c = o?.scorecards.find((x) => x.id === target.entityId);
        if (c) return { ...ctx, name: c.name, firstName: c.name.split(/\s+/)[0] || c.name, journeyStage: c.lifecycleStage, trust: c.health.trust, truthScore: c.truthScore, recommendation: c.aiRecommendation, strategy: c.strategy.recommendedStrategy, price: c.property.askingPrice, facts: [c.property.priceGapPct != null ? `פער מחיר ${c.property.priceGapPct}%` : "", `נטישה ${c.health.churnRisk}`, ...c.classification.slice(0, 1)].filter(Boolean) };
        break;
      }
      case "lead": {
        const o = await getLeadAgentScorecards(orgId).catch(() => null);
        const c = o?.scorecards.find((x) => x.id === target.entityId);
        if (c) return { ...ctx, name: c.name, firstName: c.name.split(/\s+/)[0] || c.name, journeyStage: c.lifecycleStage, truthScore: c.truthScore, recommendation: c.aiRecommendation, strategy: c.strategy.recommendedStrategy, reason: `כוונה: ${c.intent.fit} · ניתוב: ${c.routing.target}`, facts: [`כוונה ${c.intent.fit} (${c.intent.confidence}%)`, ...c.classification.slice(0, 2)] };
        break;
      }
      case "property": {
        const o = await getListingScorecards(orgId).catch(() => null);
        const c = o?.scorecards.find((x) => x.id === target.entityId);
        if (c) return { ...ctx, name: c.title, propertyTitle: c.title, price: c.price, truthScore: c.truthScore, strategy: c.strategy.recommendedStrategy, recommendation: c.recommendations[0]?.action ?? null, facts: [c.valuation.rangePosition ? `מיקום מול הערכה: ${c.valuation.rangePosition}` : "", c.marketPerformance ? `ציון שוק ${c.marketPerformance.score}` : "", ...c.classification.slice(0, 1)].filter(Boolean) };
        break;
      }
      case "office": {
        const o = await getOfficeGrowthScorecard(orgId).catch(() => null);
        const c = o?.scorecard;
        if (c) return { ...ctx, name: c.name, officeName: ctx.officeName ?? c.name, strategy: c.strategy.recommendedStrategy, recommendation: c.aiRecommendation, facts: c.decisions.slice(0, 3).map((d) => d.title) };
        break;
      }
      default: break; // broker / mission → generic context
    }
  } catch { /* fall back to base context */ }
  return ctx;
}

/** Assemble context (read-only) + build the approval-gated draft bundle. */
export async function generateDraft(orgId: string | null, target: DraftTarget, request: DraftRequest, sender: DraftSender = { brokerName: null, officeName: null }): Promise<DraftBundle> {
  const ctx = await enrich(orgId, target, base(target, sender));
  return buildDraftBundle(ctx, request);
}
