// ============================================================================
// ZONO Property Radar™ — shared market cache public surface.
// ============================================================================
export { createMarketAreaKey, type MarketAreaKeyInput } from "./area-key";
export { runMarketAreaSync, type MarketSyncDeps } from "./engine";
export { fanoutMarketSourcesToRelevantOrgs } from "./fanout";
export { isCacheFresh, computeNextScanAfter, DEFAULT_TTL_MINUTES } from "./cache-state";
export { createMarketRepository } from "./repository";

export type {
  MarketPropertySource,
  MarketSyncWatermark,
  MarketAreaCacheState,
  OrgMarketPropertyLink,
  MarketRepository,
  MarketSyncInput,
  MarketSyncResult,
  FanoutInput,
  FanoutResult,
  FanoutSource,
} from "./types";
