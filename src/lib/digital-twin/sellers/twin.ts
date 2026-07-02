// ============================================================================
// 🏷️ Seller Digital Twin — assembler (pure). 28.2.
// Composes the universal framework with the Seller logic into one SellerTwin —
// the same pattern as the Buyer twin, proving framework reuse.
// ============================================================================
import { createDigitalTwin, buildTwinMemory } from "../core";
import type { SellerSeed, SellerActivityInput, SellerTwin } from "./types";
import {
  toTwinActivities, computeSellerProfile, detectSellerLearning,
  sellerDecisionSignals, sellerMissionSignals, classifySeller,
} from "./seller";

export interface BuildSellerTwinInput {
  seed: SellerSeed;
  activities: SellerActivityInput[];
  truth?: Parameters<typeof createDigitalTwin>[0]["truth"];
  relationshipEdges?: { from: string; to: string; type: string; strength: number }[];
  orgMemoryLessons?: string[];
  now?: number;
}

export function buildSellerTwin(input: BuildSellerTwinInput): SellerTwin {
  const now = input.now ?? Date.now();
  const acts = toTwinActivities(input.activities);
  const memory = buildTwinMemory(acts, now);
  const profile = computeSellerProfile(input.seed, acts, now);
  const learnings = detectSellerLearning(input.seed, profile, acts, now);
  const decisions = sellerDecisionSignals(input.seed, profile, memory.recencyScore);
  const missions = sellerMissionSignals(input.seed, profile);
  const classification = classifySeller(input.seed, profile, memory.recencyScore, memory.totalActivities);

  return createDigitalTwin({
    id: input.seed.id, entityType: "seller", name: input.seed.name,
    createdAt: input.seed.createdAt, updatedAt: input.seed.updatedAt,
    profile, activities: acts, completeness: profile.completeness, risk: profile.churnRisk,
    truth: input.truth, relationshipEdges: input.relationshipEdges, orgMemoryLessons: input.orgMemoryLessons,
    decisions, missions, learnings, classification, now,
  });
}
