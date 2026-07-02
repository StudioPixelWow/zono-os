// ============================================================================
// 🧠 ZONO Organizational Memory™ & Learning Brain — public surface. 27.8.
// ONE organizational memory: events → timeline → success/failure patterns →
// learning objects → decision improvement + Chief-of-Staff answers + executive
// memory. Derived from real persisted history (mission outcomes); the memory
// belongs to the organization, not the LLM. Evidence-only; no schema changes;
// no modification to any protected engine.
// ============================================================================
export { deriveEventsFromMissions, eventLabel, entityLabel, type MissionLike } from "./events";
export { buildTimeline } from "./timeline";
export { detectSuccessPatterns, detectFailurePatterns } from "./patterns";
export { patternsToLearnings } from "./learning";
export { buildDecisionImprovements, applyImprovementsToDecisions } from "./decision-improvement";
export { buildChiefOfStaffAnswers, weTriedThisBefore } from "./chief-of-staff";
export { buildExecutiveMemory } from "./executive-memory";
export { getOrgMemoryReport } from "./service";
export { runSelfCheck, type OMSelfCheck, type OMCheck } from "./qa";
export { clamp } from "./util";
export { ORG_MEMORY_VERSION } from "./types";
export type {
  MemoryEventType, Outcome, Impact, MemoryEvent, TimelineEntry, PatternKind, Pattern,
  Learning, DecisionImprovement, MemoryAnswer, ExecutiveMemory, OrgMemoryReport,
} from "./types";
