// ============================================================================
// 🛡️ Truth Engine — Evidence Graph (pure). 27.7. Part 3.
// For any fact set: where it came from, when, how many sources support vs
// contradict, and how diverse those sources are. No fabrication — a graph over
// only the evidence actually provided.
// ============================================================================
import type { EvidenceItem, EvidenceGraph } from "./types";

const cmpIso = (a: string | null, b: string | null): number => {
  if (!a) return -1; if (!b) return 1; return a.localeCompare(b);
};

export function buildEvidenceGraph(evidence: EvidenceItem[]): EvidenceGraph {
  const sources = new Set<string>();
  const sourceTypes = new Set<string>();
  let supporting = 0, contradicting = 0;
  let latestAt: string | null = null, oldestAt: string | null = null;

  for (const e of evidence) {
    if (e.source) sources.add(e.source);
    if (e.sourceType) sourceTypes.add(e.sourceType);
    const stance = e.stance ?? "support";
    if (stance === "support") supporting += 1;
    else if (stance === "contradict") contradicting += 1;
    if (e.at) {
      if (!latestAt || cmpIso(e.at, latestAt) > 0) latestAt = e.at;
      if (!oldestAt || cmpIso(e.at, oldestAt) < 0) oldestAt = e.at;
    }
  }

  return {
    count: evidence.length, diversity: sourceTypes.size,
    supporting, contradicting,
    sources: [...sources], sourceTypes: [...sourceTypes],
    latestAt, oldestAt,
  };
}
