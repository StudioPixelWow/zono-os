// ============================================================================
// 🏘️ ZONO — Street & Building Intelligence — barrel. 34.1.
// The missing street/building granularity for inventory acquisition. Feeds the
// EXISTING Seller Intelligence / Exclusive Acquisition engine; no new scoring, no
// new tables, read-only, nothing executes.
// ============================================================================
export { buildStreetBuildingIntel, type TxInput, type StreetIntel, type BuildingIntel, type StreetBuildingIntelligence } from "./intel";
export { runSelfCheck } from "./qa";
export { getStreetBuildingIntelligence } from "./service";
