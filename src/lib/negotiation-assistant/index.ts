// ============================================================================
// 🤝 ZONO — AI Negotiation Assistant — barrel. PHASE 59.0.
// Co-pilot for negotiation strategy, scripts and next steps. No legal advice
// (legal → handoff), no binding financial promises, no fabricated valuations,
// no automatic messages (drafts are approval-gated + never sent).
// ============================================================================
export {
  NEGOTIATION_VERSION, RULES_NOTE, OBJECTION_HE, STANCE_HE,
  type NegotiationInput, type OfferInput, type NegotiationPlan, type Objection,
  type RankedOffer, type PriceStrategy, type DraftSuggestion, type LegalHandoff, type Stance,
} from "./types";
export { assembleNegotiationPlan, detectObjections, detectLegal, compareOffers, priceStrategy } from "./engine";
export { buildNegotiationPlan, listNegotiationProperties, type BuildPlanInput, type NegotiationPropertyLite } from "./service";
export { runSelfCheck } from "./qa";
