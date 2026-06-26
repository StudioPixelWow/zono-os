// ============================================================================
// ZONO — PHASE 26.9: RAIN graph assembly (PURE, client-safe). No IO, no
// server-only deps — shared by the server query layer and unit-tested directly.
// Turns raw node/edge lists into the UI-ready { nodes, edges, stats, confidence }
// payload, computes stats/confidence, and extracts subgraphs.
// ============================================================================
import type { RainNode, RainEdge, RainGraph, RainStats, RainConfidenceSummary } from "./rainTypes";

export function buildStats(nodes: RainNode[], edges: RainEdge[]): RainStats {
  const byType = (t: RainNode["nodeType"]) => nodes.filter((n) => n.nodeType === t).length;
  const highThreat = nodes.filter((n) => n.nodeType === "agency" && typeof n.metadata.threat === "number" && (n.metadata.threat as number) >= 70).length;
  return {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    agencies: byType("agency"),
    agents: byType("agent"),
    properties: byType("property"),
    territories: byType("city") + byType("neighborhood") + byType("street"),
    activeSignals: byType("signal"),
    highThreatCompetitors: highThreat,
  };
}

export function buildConfidence(nodes: RainNode[]): RainConfidenceSummary {
  let high = 0, medium = 0, low = 0, scored = 0;
  for (const n of nodes) {
    if (n.confidence === "high") high++;
    else if (n.confidence === "medium") medium++;
    else low++;
    if (n.importanceScore != null) scored++;
  }
  return { high, medium, low, scoredNodes: scored, unscoredNodes: nodes.length - scored };
}

/** Drop edges whose endpoints are not both present in the node set. */
export function assemble(nodes: RainNode[], edges: RainEdge[]): RainGraph {
  const ids = new Set(nodes.map((n) => n.id));
  const kept = edges.filter((e) => ids.has(e.sourceNodeId) && ids.has(e.targetNodeId));
  return { nodes, edges: kept, stats: buildStats(nodes, kept), confidence: buildConfidence(nodes) };
}

/** BFS subgraph around a center node up to `depth` hops, over the given edge set. */
export function subgraphFrom(allNodes: RainNode[], allEdges: RainEdge[], centerNodeId: string, depth: number): RainGraph {
  const nodeById = new Map(allNodes.map((n) => [n.id, n]));
  if (!nodeById.has(centerNodeId)) return { nodes: [], edges: [], stats: buildStats([], []), confidence: buildConfidence([]) };
  const adj = new Map<string, RainEdge[]>();
  const push = (k: string, e: RainEdge) => { const a = adj.get(k); if (a) a.push(e); else adj.set(k, [e]); };
  for (const e of allEdges) { push(e.sourceNodeId, e); push(e.targetNodeId, e); }
  const visited = new Set<string>([centerNodeId]);
  let frontier = [centerNodeId];
  const keptEdges = new Set<RainEdge>();
  for (let d = 0; d < Math.max(0, depth); d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const e of adj.get(id) ?? []) {
        keptEdges.add(e);
        const other = e.sourceNodeId === id ? e.targetNodeId : e.sourceNodeId;
        if (!visited.has(other) && nodeById.has(other)) { visited.add(other); next.push(other); }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  const nodes = [...visited].map((id) => nodeById.get(id)!).filter(Boolean);
  return assemble(nodes, [...keptEdges]);
}
