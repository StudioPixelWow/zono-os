// ============================================================================
// ZONO INTELLIGENCE FABRIC™ — the official interface.
// ----------------------------------------------------------------------------
// This barrel IS the Single Source of Truth surface. Future AI agents, future
// modules and UI server components consume the Fabric from here — never raw
// tables, never each other. Server-only data functions are guarded inside their
// own modules; the pure helpers below are safe anywhere.
//
//        Engine ─▶ Intelligence Fabric ─▶ Other Engines / AI Agents
//
//   Knowledge API · Shared Context · Confidence · Explainability · Metrics
//   Relationships · Timeline · Intelligence Events · Cache · Recommendations
// ============================================================================

// ── Contracts (client-safe) ─────────────────────────────────────────────────
export * from "./types";

// ── Shared pure engines (client-safe) ───────────────────────────────────────
export * from "./metrics";
export * from "./confidence";
export * from "./explain";
export * from "./relationships";
export * from "./recommendation";

// ── Runtime infrastructure ──────────────────────────────────────────────────
export { on, onAny, publish, makeEvent, recentEvents } from "./events";
export { cacheKey, getCached, setCached, memo, invalidateEntity, invalidateType, cacheStats } from "./cache";
export { registerProducer, producersFor, allProducers, gather } from "./registry";
export type { Producer, ProducerContribution } from "./registry";

// ── Knowledge API (server) ──────────────────────────────────────────────────
export {
  getKnowledge,
  getPropertyKnowledge, getListingKnowledge, getBrokerKnowledge, getOfficeKnowledge,
  getAgentKnowledge, getNeighborhoodKnowledge, getMarketKnowledge, getSellerKnowledge,
  getBuyerKnowledge, getOpportunityKnowledge, getCompetitionKnowledge,
  getRelationshipKnowledge, getTimelineKnowledge,
} from "./knowledge";

// ── Context · Timeline · Search · Recommendations (server) ──────────────────
export { assembleContext } from "./context";
export type { ContextBundle } from "./context";
export { getEntityTimeline, mergeTimeline } from "./timeline";
export {
  askFabric, getEntityRecommendations,
  whoDominatesNeighborhood, fastestGrowingOffice, relationshipsAround, marketActivity,
} from "./search";
export { ensureProvidersRegistered } from "./providers";
export { ensureReactionsWired } from "./reactions";

// ── One-call bootstrap (server) ─────────────────────────────────────────────
import { ensureProvidersRegistered as _p } from "./providers";
import { ensureReactionsWired as _r } from "./reactions";
/** Register all built-in producers + reaction subscriptions. Idempotent. */
export function initFabric(): void { _p(); _r(); }
