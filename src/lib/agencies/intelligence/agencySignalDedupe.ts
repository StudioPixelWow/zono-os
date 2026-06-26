// ============================================================================
// ZONO — Agency signal dedupe (Phase 26.6, PURE, client-safe).
// Deterministic dedupe keys so re-running the detector updates the existing
// ACTIVE signal in place instead of spamming duplicates. Also decides whether an
// existing signal has changed MATERIALLY enough to refresh / re-surface.
// ============================================================================
import type { DetectedAgencySignal } from "./agencySignalTypes";

/**
 * Stable dedupe key for a signal: agency + signal type + territory. Continuous
 * detection updates the same active row; period is intentionally NOT part of the
 * key so a persisting condition stays a single signal rather than one-per-period.
 */
export function dedupeKey(agencyId: string, signalType: string, territoryKey?: string | null): string {
  return [agencyId, signalType, territoryKey || "agency"].join("::");
}

/** Stable metric key (independent of direction) so previous values can be read. */
export function metricKey(agencyId: string, metric: string, territoryKey?: string | null): string {
  return [agencyId, metric, territoryKey || "agency"].join("|");
}

/**
 * Has an existing active signal changed materially vs a freshly detected one?
 * Refresh when the after-value moved meaningfully, severity escalated, or
 * importance jumped — otherwise leave the existing row untouched (no spam).
 */
export function materiallyChanged(
  existing: { scoreAfter: number | null; severity: string | null; importance: number | null },
  incoming: Pick<DetectedAgencySignal, "scoreAfter" | "severity" | "importance">,
): boolean {
  const sevRank: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
  const sevEsc = (sevRank[incoming.severity] ?? 0) > (sevRank[existing.severity ?? "low"] ?? 0);
  const valMoved = existing.scoreAfter != null && incoming.scoreAfter != null
    ? Math.abs(incoming.scoreAfter - existing.scoreAfter) >= 5
    : existing.scoreAfter !== incoming.scoreAfter;
  const impJumped = Math.abs((incoming.importance ?? 0) - (existing.importance ?? 0)) >= 10;
  return sevEsc || valMoved || impJumped;
}

/** De-duplicate a freshly detected batch by dedupe key (keep highest importance). */
export function dedupeDetectedBatch(signals: DetectedAgencySignal[]): DetectedAgencySignal[] {
  const map = new Map<string, DetectedAgencySignal>();
  for (const s of signals) {
    const prev = map.get(s.dedupeKey);
    if (!prev || s.importance > prev.importance) map.set(s.dedupeKey, s);
  }
  return [...map.values()];
}
