// ============================================================================
// ZONO — Office benchmarks (pure). Compare a current period vs a previous one.
// ============================================================================
import { pctChange } from "./analytics";
import type { Benchmark } from "./types";

const LABELS: Record<string, string> = {
  listings: "נכסים", opportunities: "הזדמנויות", buyerMatches: "התאמות קונים", contacts: "פניות",
  meetings: "פגישות", exclusives: "בלעדיות", deals: "עסקאות", revenue: "הכנסות", creditsSaved: "קרדיטים שנחסכו",
};

/** Build benchmarks for the known metric keys present in both maps. */
export function buildBenchmarks(current: Record<string, number>, previous: Record<string, number>): Benchmark[] {
  return Object.keys(LABELS).map((metric) => {
    const cur = current[metric] ?? 0;
    const prev = previous[metric] ?? 0;
    const deltaPct = pctChange(cur, prev);
    const direction: Benchmark["direction"] = deltaPct == null ? "flat" : deltaPct > 1 ? "up" : deltaPct < -1 ? "down" : "flat";
    return { metric, label: LABELS[metric]!, current: cur, previous: prev, deltaPct, direction };
  });
}
