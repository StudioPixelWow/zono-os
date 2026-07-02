// ============================================================================
// 👤 Buyer Digital Twin — assembler (pure). 28.1.
// Composes the universal framework primitives with the Buyer logic into one
// BuyerTwin. This is the pattern EVERY future entity twin follows: compute the
// entity profile → derive learning/decisions/missions/classification → hand them
// to createDigitalTwin. No framework code is entity-specific.
// ============================================================================
import { createDigitalTwin, buildTwinMemory } from "../core";
import type { BuyerSeed, BuyerActivityInput, BuyerTwin } from "./types";
import {
  toTwinActivities, computeBuyerProfile, detectBuyerLearning,
  buyerDecisionSignals, buyerMissionSignals, classifyBuyer,
} from "./buyer";

export interface BuildBuyerTwinInput {
  seed: BuyerSeed;
  activities: BuyerActivityInput[];
  truth?: Parameters<typeof createDigitalTwin>[0]["truth"];
  relationshipEdges?: { from: string; to: string; type: string; strength: number }[];
  orgMemoryLessons?: string[];
  now?: number;
}

export function buildBuyerTwin(input: BuildBuyerTwinInput): BuyerTwin {
  const now = input.now ?? Date.now();
  const acts = toTwinActivities(input.activities);
  const memory = buildTwinMemory(acts, now);
  const profile = computeBuyerProfile(input.seed, acts, now);
  const learnings = detectBuyerLearning(profile, acts, now);
  const decisions = buyerDecisionSignals(profile, memory.recencyScore);
  const missions = buyerMissionSignals(profile);
  const classification = classifyBuyer(input.seed, profile, memory.recencyScore, memory.totalActivities);

  return createDigitalTwin({
    id: input.seed.id, entityType: "buyer", name: input.seed.name,
    createdAt: input.seed.createdAt, updatedAt: input.seed.updatedAt,
    profile, activities: acts, completeness: profile.completeness, risk: profile.risk,
    truth: input.truth, relationshipEdges: input.relationshipEdges, orgMemoryLessons: input.orgMemoryLessons,
    decisions, missions, learnings, classification, now,
  });
}
