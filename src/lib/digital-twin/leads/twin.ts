// ============================================================================
// 🎯 Lead Digital Twin — assembler (pure). 28.3.
// Composes the universal framework with the Lead logic — the same pattern as
// the Buyer and Seller twins, proving framework reuse for a third entity.
// ============================================================================
import { createDigitalTwin, buildTwinMemory } from "../core";
import type { LeadSeed, LeadActivityInput, LeadTwin } from "./types";
import {
  toTwinActivities, computeLeadProfile, detectLeadLearning,
  leadDecisionSignals, leadMissionSignals, classifyLead,
} from "./lead";

export interface BuildLeadTwinInput {
  seed: LeadSeed;
  activities: LeadActivityInput[];
  truth?: Parameters<typeof createDigitalTwin>[0]["truth"];
  relationshipEdges?: { from: string; to: string; type: string; strength: number }[];
  orgMemoryLessons?: string[];
  now?: number;
}

export function buildLeadTwin(input: BuildLeadTwinInput): LeadTwin {
  const now = input.now ?? Date.now();
  const acts = toTwinActivities(input.activities);
  const memory = buildTwinMemory(acts, now);
  const profile = computeLeadProfile(input.seed, acts, now);
  const learnings = detectLeadLearning(input.seed, profile, acts, now);
  const decisions = leadDecisionSignals(input.seed, profile);
  const missions = leadMissionSignals(input.seed, profile);
  const classification = classifyLead(input.seed, profile, memory.recencyScore, memory.totalActivities);

  return createDigitalTwin({
    id: input.seed.id, entityType: "lead", name: input.seed.name,
    createdAt: input.seed.createdAt, updatedAt: input.seed.updatedAt,
    profile, activities: acts, completeness: profile.completeness, risk: clamp100(100 - profile.conversionProbability),
    truth: input.truth, relationshipEdges: input.relationshipEdges, orgMemoryLessons: input.orgMemoryLessons,
    decisions, missions, learnings, classification, now,
  });
}
const clamp100 = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
