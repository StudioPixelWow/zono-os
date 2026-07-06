// ============================================================================
// 🌐 ZONO — Universal Knowledge Graph — query helpers (pure). PHASE 51.0.
// Read helpers over an EntityGraph built by relationship-graph's buildGraph():
// incident edges, neighbors, subgraph, shortest path, per-entity relationship
// summary and an AI context pack. Deterministic; no I/O. Evidence-only — a
// missing relationship is never fabricated.
// ============================================================================
import { KIND_HE, entityHref, NO_FABRICATION_NOTE } from "./types";
import type {
  EntityGraph, GraphNode, RelationshipEdge,
  SummaryConnection, RelationshipSummary, EntityContextPack, RelationshipTypeGroup,
} from "./types";
import { RELATION_HE } from "@/lib/relationship-graph/types";

const kindHe = (k: string) => KIND_HE[k] ?? k;
const relHe = (t: string) => RELATION_HE[t] ?? t;

export function edgesOf(graph: EntityGraph, id: string): RelationshipEdge[] {
  return graph.edges.filter((e) => e.from === id || e.to === id);
}
export function neighborsOf(graph: EntityGraph, id: string): GraphNode[] {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const ids = new Set<string>();
  for (const e of edgesOf(graph, id)) ids.add(e.from === id ? e.to : e.from);
  return [...ids].map((nid) => nodeById.get(nid)).filter((n): n is GraphNode => !!n);
}

/** Shortest path (node ids, inclusive) between a and b, or [] if unconnected. */
export function pathBetween(graph: EntityGraph, a: string, b: string, maxDepth = 4): string[] {
  if (a === b) return [a];
  const adj = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    (adj.get(e.from) ?? adj.set(e.from, new Set()).get(e.from)!).add(e.to);
    (adj.get(e.to) ?? adj.set(e.to, new Set()).get(e.to)!).add(e.from);
  }
  const queue: string[][] = [[a]];
  const seen = new Set<string>([a]);
  while (queue.length) {
    const path = queue.shift()!;
    if (path.length > maxDepth + 1) continue;
    const last = path[path.length - 1];
    for (const nxt of adj.get(last) ?? []) {
      if (nxt === b) return [...path, b];
      if (!seen.has(nxt)) { seen.add(nxt); queue.push([...path, nxt]); }
    }
  }
  return [];
}

/** The subgraph reachable from `id` within `depth` hops (inclusive). */
export function subgraph(graph: EntityGraph, id: string, depth = 1): EntityGraph {
  const keep = new Set<string>([id]);
  let frontier = new Set<string>([id]);
  for (let d = 0; d < depth; d++) {
    const next = new Set<string>();
    for (const nid of frontier) for (const n of neighborsOf(graph, nid)) if (!keep.has(n.id)) { keep.add(n.id); next.add(n.id); }
    frontier = next;
  }
  const nodes = graph.nodes.filter((n) => keep.has(n.id));
  const edges = graph.edges.filter((e) => keep.has(e.from) && keep.has(e.to));
  const byType: Record<string, number> = {};
  for (const e of edges) byType[e.type] = (byType[e.type] ?? 0) + 1;
  return { nodes, edges, counts: { nodes: nodes.length, edges: edges.length, byType } };
}

function toConnection(graph: EntityGraph, id: string, e: RelationshipEdge): SummaryConnection {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const outward = e.from === id;
  const otherId = outward ? e.to : e.from;
  const otherType = outward ? e.toType : e.fromType;
  const other = nodeById.get(otherId);
  return {
    id: otherId, kind: String(otherType), kindHe: kindHe(String(otherType)),
    name: other?.name ?? otherId, relation: e.type, relationHe: relHe(String(e.type)),
    direction: outward ? "out" : "in",
    strength: e.strength, confidence: e.confidence, freshness: e.freshness,
    freshnessLevel: e.freshnessLevel, verification: e.verification,
    evidence: e.evidence.length ? e.evidence : e.explanation.evidence, href: entityHref(String(otherType), otherId),
  };
}

/** Per-entity relationship summary (grouped by relation type + top connections). */
export function relationshipSummary(graph: EntityGraph, id: string, entityName?: string): RelationshipSummary {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const self = nodeById.get(id);
  const incident = edgesOf(graph, id);
  const connections = incident
    .map((e) => toConnection(graph, id, e))
    .sort((a, b) => b.strength - a.strength || b.confidence - a.confidence);

  const groups = new Map<string, RelationshipTypeGroup>();
  for (const c of connections) {
    const g = groups.get(c.relation) ?? { type: c.relation, typeHe: c.relationHe, count: 0 };
    g.count++; groups.set(c.relation, g);
  }
  const avg = connections.length ? Math.round(connections.reduce((s, c) => s + c.confidence, 0) / connections.length) : 0;
  const notes = [NO_FABRICATION_NOTE];
  if (!connections.length) notes.unshift("לא נמצאו קשרים מתועדים לישות זו עדיין.");

  return {
    entityType: String(self?.type ?? "unknown"), entityId: id, entityName: entityName ?? self?.name ?? id,
    totalConnections: connections.length,
    byType: [...groups.values()].sort((a, b) => b.count - a.count),
    connections,
    avgConfidence: avg,
    strongestConnection: connections[0] ?? null,
    hasData: connections.length > 0,
    notes,
  };
}

/** A compact, evidence-backed context pack for AI consumers. */
export function buildContextPack(graph: EntityGraph, id: string, entityName?: string): EntityContextPack {
  const s = relationshipSummary(graph, id, entityName);
  const lines = s.connections.slice(0, 8).map((c) => {
    const dir = c.direction === "out" ? `${s.entityName} ${c.relationHe} ${c.name}` : `${c.name} ${c.relationHe} ${s.entityName}`;
    const conf = `ביטחון ${c.confidence}`;
    const fresh = c.freshnessLevel === "expired" ? "מיושן" : c.freshnessLevel === "stale" ? "ישן" : c.freshnessLevel === "fresh" ? "עדכני" : "";
    return `${dir} (${kindHe(c.kind)}) · ${conf}${fresh ? ` · ${fresh}` : ""}`;
  });
  return {
    entityType: s.entityType, entityId: s.entityId, entityName: s.entityName,
    lines, connections: s.connections.slice(0, 12), totalConnections: s.totalConnections,
    avgConfidence: s.avgConfidence, generatedAt: null,
  };
}
