// ============================================================================
// 🛒 ZONO — Buyer Portal™ — barrel. 32.3.
// The buyer's authenticated personal AI workspace, reusing existing engines.
// No engine modified; no business logic duplicated; nothing auto-executes.
// ============================================================================
export { buildDashboard, buildFavorites, buildNotifications } from "./assemble";
export { aiSummary, explainRecommendation, buyingTips, timelineGuidance, offerPrepGuidance, mortgagePrepGuidance, buyerGuides, STAGE_HE, budgetLine } from "./content";
export { runSelfCheck } from "./qa";
export {
  resolvePortalBuyer, getBuyerDashboard, getBuyerFavorites, getBuyerProfile, getBuyerAppointments,
  getBuyerMessages, getBuyerDocuments, getBuyerRecommendations, getBuyerProperty, askBuyer,
  type PortalResolution, type PortalResult,
} from "./service";
export * from "./types";
