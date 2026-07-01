// ============================================================================
// ⚔️ Brokerage Competitive Intelligence Engine™ — public surface. Phase 26.7.
// Office-vs-office + city market intelligence, SWOT, opportunities and strategic
// insights — evidence-only, from existing attributed listings. No valuation /
// MAI / discovery / territory / broker-intel / verification changes.
// ============================================================================
export { getCityCompetitiveDashboard, getOfficeCompetitiveProfile } from "./service";
export { officeAggregates, marketSnapshot, competitiveMatrix, swot, detectOpportunities, strategicInsights } from "./compute";
export { runSelfCheck, type CISelfCheck, type CICheck } from "./qa";
export { COMPETITIVE_VERSION } from "./types";
export type {
  Momentum, ThreatLevel, ConcentrationLevel, OfficeAggregate, MarketSnapshot, CompetitorRef,
  CompetitiveMatrix, Swot, SwotItem, Opportunity, StrategicInsight,
  OfficeCompetitiveProfile, CityCompetitiveDashboard,
} from "./types";
