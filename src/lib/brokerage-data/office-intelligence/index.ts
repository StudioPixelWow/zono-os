// ============================================================================
// 🏢 Office Intelligence Builder™ — public surface. 26.4.18.
// Candidate-level enrichment: build a rich, evidence-backed office profile, then
// re-run the EXISTING verification rule to decide promotion. Reuses public
// search + research-agent promotion. No new engine/AI-seeding/rule/schema.
// ============================================================================
export { buildOfficeIntelligenceForCandidate, buildOfficeIntelligenceForCity } from "./builder";
export { buildProfileDraft, type Hit } from "./extract";
export { runSelfCheck, type OIISelfCheck, type OIICheck } from "./qa";
export { OFFICE_INTELLIGENCE_VERSION } from "./types";
export type {
  OfficeProfileDraft, ProfileSignals, EvidenceRef, EnrichmentResult, CityEnrichmentResult,
} from "./types";
