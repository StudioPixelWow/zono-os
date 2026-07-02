// ============================================================================
// 🎯 Lead Digital Twin — public surface. 28.3. Third implementation of the
// universal Digital Twin Framework.
// ============================================================================
export { buildLeadTwin, type BuildLeadTwinInput } from "./twin";
export {
  computeLeadProfile, detectLeadLearning, leadDecisionSignals, leadMissionSignals,
  classifyLead, toTwinActivities, canonicalLeadKind,
} from "./lead";
export { getLeadTwins, getLeadTwinById, type LeadTwinsOverview } from "./service";
export type {
  LeadProfile, LeadSeed, LeadActivityInput, LeadBehavior, LeadIntent, LeadTwin,
} from "./types";
