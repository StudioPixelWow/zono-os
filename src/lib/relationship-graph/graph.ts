// ============================================================================
// 🕸️ Relationship Graph — graph assembly (pure). 27.9. Part 1.
// Aggregates raw relations into weighted edges and computes node degrees. The
// Universal Entity Graph: nodes (any entity type) + first-class edges.
// ============================================================================
import { buildEdge } from "./edge";
import type { RawRelation, EntityGraph, GraphNode, RelationshipEdge, EntityType } from "./types";

export interface NodeSeed { id: string; type: EntityType; name: string }

export function buildGraph(seeds: NodeSeed[], relations: RawRelation[]): EntityGraph {
  const nodeMap = new Map<string, GraphNode>();
  const ensure = (id: string, type: EntityType, name: string) => {
    if (!nodeMap.has(id)) nodeMap.set(id, { id, type, name, degree: 0, weightedDegree: 0 });
  };
  for (const s of seeds) ensure(s.id, s.type, s.name);

  // Group raw relations by (from|to|type).
  const groups = new Map<string, RawRelation[]>();
  for (const r of relations) {
    if (!r.from || !r.to || r.from === r.to) continue;
    const key = `${r.from}|${r.to}|${r.type}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  const edges: RelationshipEdge[] = [];
  let i = 0;
  for (const [key, group] of groups) {
    const first = group[0];
    ensure(first.from, first.fromType, first.from);
    ensure(first.to, first.toType, first.to);
    edges.push(buildEdge(`edge-${++i}`, first.from, first.to, first.fromType, first.toType, first.type, group));
    void key;
  }

  // Degrees.
  for (const e of edges) {
    const a = nodeMap.get(e.from); const b = nodeMap.get(e.to);
    if (a) { a.degree += 1; a.weightedDegree += e.strength; }
    if (b) { b.degree += 1; b.weightedDegree += e.strength; }
  }

  const byType: Record<string, number> = {};
  for (const e of edges) byType[e.type] = (byType[e.type] ?? 0) + 1;

  const nodes = [...nodeMap.values()].map((n) => ({ ...n, weightedDegree: Math.round(n.weightedDegree) }));
  return { nodes, edges, counts: { nodes: nodes.length, edges: edges.length, byType } };
}
