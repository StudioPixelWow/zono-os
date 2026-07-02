// ============================================================================
// 👤 Buyer Digital Twin — public surface. 28.1. First implementation of the
// universal Digital Twin Framework.
// ============================================================================
export { buildBuyerTwin, type BuildBuyerTwinInput } from "./twin";
export {
  computeBuyerProfile, detectBuyerLearning, buyerDecisionSignals, buyerMissionSignals,
  classifyBuyer, toTwinActivities, canonicalKind,
} from "./buyer";
export { buildBuyerMatches } from "./matching";
export { getBuyerTwins, getBuyerTwinById, type BuyerTwinsOverview } from "./service";
export type {
  BuyerProfile, BuyerSeed, BuyerActivityInput, BuyerBehavior, BuyerPreferencesT,
  BuyerTemp, ExpectedWindow, ListingCandidate, BuyerMatch, BuyerMatches, BuyerTwin,
} from "./types";
