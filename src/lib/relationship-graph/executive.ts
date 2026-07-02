// ============================================================================
// 🕸️ Relationship Graph — Executive Relationship Dashboard (pure). 27.9. Part 8.
// Most connected entities, strategic relationships, missing relationships,
// growth opportunities and network health for the CEO surface.
// ============================================================================
import type { EntityGraph, NetworkAnalysis, ExecutiveGraph, RankedNode } from "./types";

export function buildExecutiveGraph(graph: EntityGraph, network: NetworkAnalysis): ExecutiveGraph {
  const mostConnected: RankedNode[] = [...graph.nodes]
    .sort((a, b) => b.degree - a.degree || b.weightedDegree - a.weightedDegree)
    .slice(0, 10)
    .map((n) => ({ id: n.id, name: n.name, type: n.type, degree: n.degree, weightedDegree: n.weightedDegree }));

  const strategicRelationships = graph.edges
    .filter((e) => e.strength >= 60 && (e.verification === "verified" || e.verification === "corroborated"))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 10);

  const growthOpportunities: string[] = [
    ...network.hiddenOpportunities.slice(0, 5).map((h) => `${h.aName} ↔ ${h.bName}: ${h.suggestion}`),
    ...(network.disconnectedEntities.length ? [`${network.disconnectedEntities.length} ישויות מנותקות — חבר אותן לגרף`] : []),
  ];

  const strong = graph.edges.filter((e) => e.strength >= 60).length;
  const weak = graph.edges.filter((e) => e.strength < 40).length;

  return {
    mostConnected,
    strategicRelationships,
    missingRelationships: network.hiddenOpportunities,
    growthOpportunities,
    networkHealth: network.networkHealth,
    totals: { nodes: graph.counts.nodes, edges: graph.counts.edges, strong, weak, disconnected: network.disconnectedEntities.length },
  };
}
