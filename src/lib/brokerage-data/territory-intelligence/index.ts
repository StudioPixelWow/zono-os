// ============================================================================
// 🗺️ Territory Intelligence Engine™ — public surface. Phase 26.6.
// WHO dominates every street / neighborhood / city — from existing data only.
// No valuation / MAI / discovery / broker-intel / office-inventory changes.
// ============================================================================
export { getCityTerritoryIntelligence, getOfficeTerritory, getBrokerTerritory, getAreaProfile } from "./service";
export { territoryStats, officeDominance, territoryInsights, bandFor, median, isLuxury, isRental, isCommercial } from "./aggregate";
export { runSelfCheck, type TISelfCheck, type TICheck } from "./qa";
export { TERRITORY_VERSION, DOMINANCE_BAND_HE } from "./types";
export type {
  TerritoryLevel, DominanceBand, AttributedListing, CountBy, OwnerShare, TerritoryStats,
  OfficeDominance, TerritoryNode, HeatCell, CityTerritoryIntelligence, AreaShare,
  OfficeTerritoryIntelligence, BrokerTerritoryIntelligence,
} from "./types";
