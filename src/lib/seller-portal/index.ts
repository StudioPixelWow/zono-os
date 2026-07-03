// ============================================================================
// 🏷️ ZONO — Seller Portal™ — barrel. 32.4.
// The seller's authenticated personal AI workspace, reusing existing engines.
// No engine modified; no business logic duplicated; nothing auto-executes.
// ============================================================================
export { buildDashboard, buildActivityTimeline, buildNotifications, groupBuyers } from "./assemble";
export { aiSummary, whyDemand, shouldPriceChange, marketExplanation, competitionExplanation, nextStep, sellerGuides, sellingTips } from "./content";
export { runSelfCheck } from "./qa";
export {
  resolvePortalSeller, getSellerDashboard, getSellerBuyerDemand, getSellerActivity, getSellerAppointments,
  getSellerMessages, getSellerDocuments, getSellerProfile, getSellerProperty, askSeller,
  type PortalResolution, type PortalResult,
} from "./service";
export * from "./types";
