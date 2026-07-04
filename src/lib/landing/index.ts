// ============================================================================
// 🎯 ZONO AI Landing Experience™ — barrel (pure, client-safe). 38.3.
// ============================================================================
export * from "./types";
export { LANDING_TYPES, getLandingConfig, isLandingType, ALL_LANDING_TYPES } from "./catalog";
export { buildLanding } from "./assemble";
export { buildLandingRecommendations, type LandingAnalyticsLean } from "./recommend";
export { runSelfCheck } from "./qa";
