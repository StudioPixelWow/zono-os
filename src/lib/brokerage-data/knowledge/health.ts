// ============================================================================
// ZONO Brokerage Knowledge — Data Health + Coverage + Diff (pure).
// Aggregates global data-quality metrics into a single explainable health
// snapshot, estimates per-city coverage, and diffs two refresh snapshots.
// ============================================================================
import type { DataHealthInput, DataHealthSnapshot, CoverageInput, CoverageResult, DiffSnapshot, RefreshDiff } from "./types";

/** Compose a data-health snapshot + a 0..100 overall score from raw counts. */
export function summarizeHealth(input: DataHealthInput): DataHealthSnapshot {
  const total = Math.max(1, input.totalOffices + input.totalAgents);
  const healthy = Math.max(0, total - input.needsReview);
  // Penalize for missing contactability, low confidence, duplicates and staleness.
  const missingPenalty = ((input.missingPhones + input.missingEmails) / total) * 30;
  const lowConfPenalty = (input.lowConfidence / total) * 25;
  const dupPenalty = Math.min(15, input.duplicateClusters * 1.5);
  const stalePenalty = input.freshnessHours == null ? 8 : Math.min(15, (input.freshnessHours / 168) * 15); // 1 week → -15
  const coverageBonus = (input.coveragePct / 100) * 15;
  const healthScore = Math.round(Math.max(0, Math.min(100, 70 + coverageBonus - missingPenalty - lowConfPenalty - dupPenalty - stalePenalty)));
  return { ...input, healthy, healthScore };
}

/**
 * Estimate per-city coverage. With no external registry of "true" office counts,
 * we derive a planning baseline from known signal (offices + agents-per-office
 * heuristic) and flag the gap. Confidence drops as the estimate outruns what we
 * actually know. Deterministic & explainable; never fabricates exact totals.
 */
export function computeCoverage(input: CoverageInput): CoverageResult {
  const knownOffices = Math.max(0, input.knownOffices);
  const knownAgents = Math.max(0, input.knownAgents);
  // ~4 agents/office is a conservative Israeli planning baseline.
  const baseline = Math.max(knownOffices, Math.round(knownAgents / 4));
  const estimated = Math.max(knownOffices, input.estimatedOffices ?? baseline);
  const coveragePct = estimated > 0 ? Math.round((knownOffices / estimated) * 100) : 0;
  const missingOffices = Math.max(0, estimated - knownOffices);
  const missingAgents = Math.max(0, Math.round(estimated * 4) - knownAgents);
  // confidence: high when we already know most of the estimate; low when guessing.
  const confidence = Math.round(Math.max(20, Math.min(95, 40 + coveragePct * 0.5)));
  return { city: input.city, estimatedOffices: estimated, knownOffices, coveragePct, knownAgents, missingOffices, missingAgents, confidence };
}

/** Diff two refresh snapshots into a permanent, comparable delta. */
export function computeDiff(prev: DiffSnapshot | null, curr: DiffSnapshot): RefreshDiff {
  if (!prev) {
    return { newOffices: curr.offices, newAgents: curr.agents, updatedPhones: 0, updatedEmails: 0,
      coverageChange: 0, marketShareChange: 0, growth: 0 };
  }
  const newOffices = Math.max(0, curr.offices - prev.offices);
  const newAgents = Math.max(0, curr.agents - prev.agents);
  return {
    newOffices, newAgents,
    updatedPhones: Math.abs(curr.phoneFingerprint - prev.phoneFingerprint),
    updatedEmails: Math.abs(curr.emailFingerprint - prev.emailFingerprint),
    coverageChange: Math.round((curr.coveragePct - prev.coveragePct) * 10) / 10,
    marketShareChange: Math.round((curr.topShare - prev.topShare) * 10) / 10,
    growth: prev.offices > 0 ? Math.round(((curr.offices - prev.offices) / prev.offices) * 1000) / 10 : 0,
  };
}
