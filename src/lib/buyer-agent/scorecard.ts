// ============================================================================
// 🛒 Buyer Agent — seller connection + scorecard (pure). 29.4. Parts 8 + 9.
// ============================================================================
import { computeBuyerHealth, clamp } from "./health";
import { computeMatchIntel } from "./matching";
import { detectBuyerRisks, detectBuyerOpportunities } from "./risk-opportunity";
import { computeBuyerStrategy } from "./strategy";
import { BUYER_STRATEGY_HE, type BuyerSignals, type MatchIntel, type SellerConnection, type BuyerScorecard } from "./types";

export function buildSellerConnection(sig: BuyerSignals, mi: MatchIntel): SellerConnection {
  const priorityListings = [...mi.perfect, ...mi.emerging].slice(0, 6).map((m) => ({ listingId: m.listingId, title: m.title, score: m.score }));
  const notes: string[] = [];
  if (!priorityListings.length) notes.push("אין נכסים בעדיפות — הרחב התאמות.");
  return { priorityListings, priorityBrokers: sig.brokerConnections.slice(0, 5), notes };
}

export function buildBuyerScorecard(sig: BuyerSignals): BuyerScorecard {
  const health = computeBuyerHealth(sig);
  const matchIntel = computeMatchIntel(sig);
  const risks = detectBuyerRisks(sig, health, matchIntel);
  const opportunities = detectBuyerOpportunities(sig, health, matchIntel);
  const strategy = computeBuyerStrategy(sig, health, matchIntel);
  const sellerConnection = buildSellerConnection(sig, matchIntel);
  const aiRecommendation = `${BUYER_STRATEGY_HE[strategy.recommendedStrategy]} — ${strategy.playbook[0]?.action ?? ""}`;
  return {
    id: sig.id, name: sig.name, classification: sig.classification,
    health, strategy, matchIntel, risks, opportunities, sellerConnection,
    lifecycleRoles: sig.lifecycleRoles, lifecycleStage: sig.lifecycleStage,
    truthScore: sig.truthScore, aiConfidence: clamp(strategy.confidence), aiRecommendation,
  };
}
