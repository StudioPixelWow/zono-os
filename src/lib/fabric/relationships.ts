// ============================================================================
// ZONO INTELLIGENCE FABRIC™ — unified relationship layer (pure, client-safe).
// ----------------------------------------------------------------------------
// One place that normalises, dedupes and ranks relationship edges contributed
// by any engine (knowledge graph, transactions, matching, communications…).
// No module re-implements relationship logic — producers emit raw edges, this
// canonicalises them so every entity exposes the same relationship shape.
// ============================================================================
import type { RelationshipEdge, EntityRef, RelationshipType } from "./types";
import { entityKey } from "./types";
import { clamp } from "./metrics";

function edgeId(e: RelationshipEdge): string {
  // Undirected-aware key so A→B and B→A with the same type collapse.
  const a = entityKey(e.from), b = entityKey(e.to);
  const [x, y] = a < b ? [a, b] : [b, a];
  return `${x}__${y}__${e.type}`;
}

/** Build one edge with bounded scores. */
export function makeEdge(input: {
  from: EntityRef; to: EntityRef; type: RelationshipType;
  strength?: number; confidence?: number; reasons?: string[]; source: string;
}): RelationshipEdge {
  return {
    from: input.from, to: input.to, type: input.type,
    strength: clamp(input.strength ?? 50), confidence: clamp(input.confidence ?? 50),
    reasons: (input.reasons ?? []).filter(Boolean), source: input.source,
  };
}

/** Dedupe edges; on collision keep the strongest and union reasons/sources. */
export function dedupeEdges(edges: RelationshipEdge[]): RelationshipEdge[] {
  const byId = new Map<string, RelationshipEdge>();
  for (const e of edges) {
    const id = edgeId(e);
    const prev = byId.get(id);
    if (!prev) { byId.set(id, { ...e, reasons: [...e.reasons] }); continue; }
    byId.set(id, {
      ...prev,
      strength: Math.max(prev.strength, e.strength),
      confidence: Math.max(prev.confidence, e.confidence),
      reasons: [...new Set([...prev.reasons, ...e.reasons])],
      source: prev.source === e.source ? prev.source : `${prev.source},${e.source}`,
    });
  }
  return [...byId.values()].sort((a, b) => b.strength - a.strength);
}

/** Neighbors of an entity from an edge set (either direction). */
export function neighborsOf(ref: Pick<EntityRef, "type" | "id">, edges: RelationshipEdge[]): EntityRef[] {
  const k = entityKey(ref);
  const out = new Map<string, EntityRef>();
  for (const e of edges) {
    if (entityKey(e.from) === k) out.set(entityKey(e.to), e.to);
    else if (entityKey(e.to) === k) out.set(entityKey(e.from), e.from);
  }
  return [...out.values()];
}
