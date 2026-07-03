// ============================================================================
// 🗺️ ZONO — Geo Intelligence / Smart Map — barrel. 32.4.
// Multi-layer geographic market intelligence. Evidence-first; reuses the market
// heatmap; does not touch the shared ZonoMap. Pure exports + server service.
// ============================================================================
export { HEATMAP_LAYERS, LAYER_BY_ID, DEFAULT_LAYER_ID } from "./layers";
export { normalizeValue, getHeatColor, rampColor, metricDomain, legendBucket, formatValue, NEUTRAL, type Domain } from "./color";
export { cellToArea, globalInsights, ALL_LAYER_IDS, type MarketCellInput } from "./derive";
export { generateMockAreas } from "./mock";
export { runSelfCheck } from "./qa";
export { getGeoIntelligence } from "./service";
export * from "./types";
