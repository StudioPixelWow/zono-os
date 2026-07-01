// ============================================================================
// 🧠 Broker Intelligence Engine™ — public surface. Phase 26.5.
// Per-broker intelligence profiles + per-office broker ranking, from existing
// data only. No MAI / valuation / verification / discovery changes.
// ============================================================================
export { getBrokerIntelligenceProfile, getOfficeBrokerRanking } from "./service";
export { classifyBrokerStatus, priceStats, specializationTags, dataQuality, rankBrokers } from "./logic";
export { runSelfCheck, type BISelfCheck, type BICheck } from "./qa";
export { BROKER_INTELLIGENCE_VERSION, BROKER_STATUS_HE } from "./types";
export type { BrokerStatus, PriceStats, BrokerIntelligenceProfile, BrokerRankCard } from "./types";
