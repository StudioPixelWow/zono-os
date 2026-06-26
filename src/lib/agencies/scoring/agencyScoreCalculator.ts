// ============================================================================
// ZONO — Agency score calculator (Phase 26.5, PURE, client-safe).
// Turns loaded evidence (AgencyScoreInput) into the 11 agency scores + overall +
// data confidence. DATA SAFETY: a score is null when it has no supporting data —
// never a fabricated 0 — and null components lower confidence + redistribute
// their weight in the overall.
// ============================================================================
import {
  meanPresent, saturate100, clamp, round1,
} from "./agencyScoringTypes";
import type { AgencyScoreInput, AgencyScoreResult, AgencyScoreKey } from "./agencyScoringTypes";
import { weightedOverall, dataConfidence } from "./agencyScoreBreakdown";

/** Compute the full agency score set from real evidence. */
export function computeAgencyScores(input: AgencyScoreInput): AgencyScoreResult {
  // ── Market strength: dominance + inventory + sales/deals + coverage breadth ──
  const hasMarketEvidence = input.avgDominance != null || input.activeListings > 0 || input.soldCount > 0 || input.dealsCount > 0;
  const marketStrength = !hasMarketEvidence ? null : meanPresent([
    input.avgDominance,
    saturate100(input.activeListings, 8),
    saturate100(input.soldCount + input.dealsCount, 4),
    saturate100(input.cities + input.neighborhoods, 5),
  ]);

  // ── Growth: momentum + expansion events + recent signals ────────────────────
  const hasGrowthEvidence = input.avgMomentum != null || input.growthEventCount > 0 || input.recentSignalCount > 0;
  const growth = !hasGrowthEvidence ? null : meanPresent([
    input.avgMomentum,
    saturate100(input.growthEventCount, 3),
    saturate100(input.recentSignalCount, 5),
  ]);

  // ── Digital: only when ANY digital field is tracked (else null) ─────────────
  const digital = !input.digitalFieldsTracked ? null : round1(clamp(
    (input.hasWebsite ? 40 : 0) + (clamp(input.socialLinkCount, 0, 4) / 4) * 40 + (input.hasGooglePlace ? 20 : 0),
    0, 100,
  ));

  // ── Luxury: luxury share from territories (null when unknown) ────────────────
  const luxury = input.luxuryShare == null ? null : round1(clamp(input.luxuryShare * 100, 0, 100));

  // ── Inventory: volume + diversity + exclusivity ─────────────────────────────
  const hasInventory = input.activeListings > 0 || input.exclusiveCount > 0;
  const inventory = !hasInventory ? null : meanPresent([
    saturate100(input.activeListings, 8),
    saturate100(input.propertyTypeDiversity, 4),
    saturate100(input.exclusiveCount, 3),
  ]);

  // ── Coverage: weighted breadth + consistency over time ──────────────────────
  const breadth = input.cities + input.neighborhoods + input.streets;
  const coverage = breadth === 0 ? null : meanPresent([
    saturate100(input.cities * 3 + input.neighborhoods * 2 + input.streets, 12),
    saturate100(input.territoryStatsCount, 6),
  ]);

  // ── Projects: only from real graph relationships ────────────────────────────
  const projects = (input.projectCount === 0 && input.developerCount === 0)
    ? null
    : saturate100(input.projectCount + input.developerCount, 3);

  // ── Reputation: only from real review data ──────────────────────────────────
  const reputation = !input.hasReputationData ? null : meanPresent([
    input.rating != null ? round1((input.rating / 5) * 100) : null,
    saturate100(input.reviewCount, 20),
  ]);

  // ── Momentum: territory momentum + recent signals ───────────────────────────
  const momentum = input.avgMomentum != null
    ? round1(meanPresent([input.avgMomentum, saturate100(input.recentSignalCount, 5)]) ?? input.avgMomentum)
    : (input.recentSignalCount > 0 ? saturate100(input.recentSignalCount, 5) : null);

  // ── Competition threat: dominance + momentum composite ──────────────────────
  const competitionThreat = (input.avgDominance == null && input.avgMomentum == null)
    ? null
    : round1(clamp(
        0.6 * (input.avgDominance ?? input.avgMomentum ?? 0) + 0.4 * (input.avgMomentum ?? input.avgDominance ?? 0),
        0, 100,
      ));

  const components: Record<AgencyScoreKey, number | null> = {
    marketStrength, growth, digital, luxury, inventory, coverage, projects, reputation, momentum, competitionThreat,
  };
  const { overall, breakdown, missing } = weightedOverall(components);

  return {
    marketStrength, growth, digital, luxury, inventory, coverage, projects, reputation, momentum, competitionThreat,
    overall, dataConfidence: dataConfidence(input), breakdown, missing,
  };
}

/**
 * Competition threat of `agency` specifically against the user's area — blends
 * the agency's base threat with the territory-overlap fraction (0..1) with the
 * user's specialization area.
 */
export function threatAgainstUserArea(baseThreat: number | null, overlapFraction: number): number | null {
  if (baseThreat == null) return null;
  const overlap = clamp(overlapFraction, 0, 1);
  // Overlap amplifies threat: no overlap → 60% of base, full overlap → 100%+.
  return round1(clamp(baseThreat * (0.6 + 0.5 * overlap), 0, 100));
}
