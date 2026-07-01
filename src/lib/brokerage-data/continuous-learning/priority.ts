// ============================================================================
// 🎚️ Continuous Learning — scheduler priorities (pure). 26.4.16 · Part 7.
// ----------------------------------------------------------------------------
// Priority order: (1) waiting candidates → (2) low coverage → (3) stale evidence
// → (4) unlinked listings → (5) unmatched brokers. Highest tier first; ties break
// by magnitude. Deterministic. No DB, no AI.
// ============================================================================
import { PRIORITY_LABEL, type CityPriority, type PriorityTier, type RefreshReason } from "./types";

export interface CitySignals {
  city: string; cityNormalized: string;
  waitingCandidates: number; unmatchedBrokers: number; unlinkedListings: number;
  coveragePct: number; freshnessScore: number; rawDataExists: boolean;
}

/** Classify a city into its highest-priority refresh tier, or null when no work. */
export function classifyCityPriority(sig: CitySignals): CityPriority | null {
  let tier: PriorityTier | null = null;
  let reason: RefreshReason = "manual";
  let score = 0;

  if (sig.waitingCandidates > 0) { tier = 1; reason = "waiting_candidates"; score = sig.waitingCandidates; }
  else if (sig.rawDataExists && sig.coveragePct < 60) { tier = 2; reason = "low_coverage"; score = 60 - sig.coveragePct; }
  else if (sig.rawDataExists && sig.freshnessScore < 70) { tier = 3; reason = "stale_evidence"; score = 70 - sig.freshnessScore; }
  else if (sig.unlinkedListings > 0) { tier = 4; reason = "new_listings"; score = sig.unlinkedListings; }
  else if (sig.unmatchedBrokers > 0) { tier = 5; reason = "new_brokers"; score = sig.unmatchedBrokers; }

  if (tier == null) return null;
  return {
    city: sig.city, cityNormalized: sig.cityNormalized, tier, tierLabel: PRIORITY_LABEL[tier], reason, score,
    signals: { waitingCandidates: sig.waitingCandidates, unmatchedBrokers: sig.unmatchedBrokers, unlinkedListings: sig.unlinkedListings, coveragePct: sig.coveragePct, freshnessScore: sig.freshnessScore, rawDataExists: sig.rawDataExists },
  };
}

/** Rank a list of priorities: lowest tier number first, then highest score. */
export function rankPriorities(list: CityPriority[]): CityPriority[] {
  return [...list].sort((a, b) => a.tier - b.tier || b.score - a.score || a.cityNormalized.localeCompare(b.cityNormalized));
}
