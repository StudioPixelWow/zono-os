// ============================================================================
// 🔗 Evidence Graph (pure). Phase 27.3 · Part 4.
// ----------------------------------------------------------------------------
// The engine never reasons over raw repositories — it reasons over Evidence
// Blocks. This derives a graph of evidence NODES from a ContextPackage, where
// every node references a source, confidence, timestamp, entity and reason.
// Deterministic. No AI, no DB. Nothing is fabricated — empty context → empty
// graph (which forces an honest "insufficient evidence").
// ============================================================================
import type { ContextPackage } from "@/lib/context-engine/types";
import type { EvidenceGraph, EvidenceNode } from "./types";

/** Best-effort entity label for a block's payload (never fabricated). */
function entityOf(data: unknown): string | null {
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const k of ["name", "title", "officeName", "city", "id"]) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number") return String(v);
    }
  }
  return null;
}

/** Build the closed evidence graph from a sanitized ContextPackage. */
export function buildEvidenceGraph(context: ContextPackage): EvidenceGraph {
  const timestamp = context.explain.timestamp || new Date().toISOString();
  const nodes: EvidenceNode[] = [];
  const sources = new Set<string>();
  const entities = new Set<string>();

  for (const block of context.blocks) {
    if (block.key === "identity") continue;        // identity is scope, not evidence
    const entity = entityOf(block.data);
    sources.add(block.source);
    if (entity) entities.add(entity);

    // One node per block …
    nodes.push({
      id: block.key,
      label: block.label,
      source: block.source,
      entity,
      confidence: block.confidence,
      timestamp,
      reason: `בלוק הקשר בעדיפות ${block.priority}`,
    });
    // … plus one node per attributable evidence item inside the block.
    block.evidence.forEach((ev, i) => {
      sources.add(ev.source);
      nodes.push({
        id: `${block.key}#${i}`,
        label: ev.detail,
        source: ev.source,
        entity,
        confidence: ev.confidence ?? null,
        timestamp,
        reason: `ראיה תומכת ל-${block.label}`,
      });
    });
  }

  return {
    nodes, sources: [...sources], entities: [...entities],
    timestamp, blockCount: context.blocks.filter((b) => b.key !== "identity").length,
  };
}

/** True when the graph has at least one real evidence node (gate for answering). */
export function graphHasEvidence(graph: EvidenceGraph): boolean {
  return graph.nodes.length > 0;
}
