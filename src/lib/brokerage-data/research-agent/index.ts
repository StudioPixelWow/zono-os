// ============================================================================
// 🧠 Brokerage Research Agent™ v1 — public surface. Phase 26.4.13.
// A multi-step, human-like research loop that learns a city's brokerage
// ecosystem. AI plans/extracts/dedupes; only public evidence verifies. Reuses
// the persistent Knowledge Base. No schema change.
// ============================================================================
export { runBrokerageResearchAgent } from "./service";
export { runSelfCheck, type AgentSelfCheck, type AgentCheck } from "./qa";
export { STAGE_HE } from "./explain";
export {
  RESEARCH_AGENT_VERSION, ALL_STAGES, DEPTH_CONFIG,
} from "./types";
export type {
  ResearchDepth, ResearchStage, AgentOptions, AgentCandidate, AgentReport,
  SearchRecord, DiscoveredName, CandidateStatus,
} from "./types";
