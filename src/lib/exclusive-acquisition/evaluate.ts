// ============================================================================
// ZONO — single deterministic evaluation entry point (pure).
// Combines scoring + exclusive probability + recommended action + lifecycle into
// one bundle. Shared by the server engine and the dev-check so the numbers are
// guaranteed identical. No AI, no randomness — same input ⇒ same output.
// ============================================================================
import { calculateSellerOpportunityScore, calculateExclusiveProbability } from "./scoring";
import { recommendNextAction } from "./recommendations";
import { nextLifecycleStage } from "./lifecycle";
import type {
  ExclusiveBand, RecommendedAction, ScoreReason, SellerLifecycleStage, SellerOutcome, SellerScoreInput,
} from "./types";

export interface EvaluateInput {
  features: SellerScoreInput;
  currentStage: SellerLifecycleStage;
  contactAttempts: number;
  hoursSinceLastContact: number | null;
  hasPositiveResponse: boolean;
  priceDroppedRecently: boolean;
  removed: boolean;
  lastOutcome: SellerOutcome | null;
}

export interface EvaluateResult {
  score: number;
  scoreReasons: ScoreReason[];
  probability: number;
  band: ExclusiveBand;
  bandLabel: string;
  probabilityReasons: ScoreReason[];
  recommendation: RecommendedAction;
  lifecycleStage: SellerLifecycleStage;
}

export function evaluateSellerOpportunity(input: EvaluateInput): EvaluateResult {
  const score = calculateSellerOpportunityScore(input.features);
  const prob = calculateExclusiveProbability(input.features, score.score);

  const recommendation = recommendNextAction({
    exclusiveProbability: prob.probability,
    band: prob.band,
    matchingBuyerCount: input.features.matchingBuyerCount,
    priceDroppedRecently: input.priceDroppedRecently,
    hoursSinceLastContact: input.hoursSinceLastContact,
    contactAttempts: input.contactAttempts,
    hasPositiveResponse: input.hasPositiveResponse,
    lifecycleStage: input.currentStage,
  });

  const lifecycleStage = nextLifecycleStage(input.currentStage, {
    score: score.score,
    exclusiveProbability: prob.probability,
    contactAttempts: input.contactAttempts,
    hoursSinceLastContact: input.hoursSinceLastContact,
    lastOutcome: input.lastOutcome,
    hasPositiveResponse: input.hasPositiveResponse,
    removed: input.removed,
  });

  return {
    score: score.score, scoreReasons: score.reasons,
    probability: prob.probability, band: prob.band, bandLabel: prob.bandLabel, probabilityReasons: prob.reasons,
    recommendation, lifecycleStage,
  };
}
