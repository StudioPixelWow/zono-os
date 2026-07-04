// ============================================================================
// 🌐 ZONO Website Builder OS™ — barrel (pure, client-safe). 38.0.
// ============================================================================
export * from "./types";
export { SECTION_CATALOG, TEMPLATES, getSectionDef, getTemplate, applyTemplate, ESSENTIAL_KEYS, CANONICAL_ORDER } from "./catalog";
export { assembleBuilderView, moveSection } from "./assemble";
export { buildRecommendations, buildHealth, analyzeSeo } from "./recommend";
export { runSelfCheck } from "./qa";
