// ============================================================================
// 🌐 ZONO — Universal Knowledge Graph — discovery (pure). PHASE 51.0.
// Turns persisted `entity_relationships` rows (the platform-wide edge store that
// EVERY module writes to) into relationship-graph RawRelations + NodeSeeds, so
// buildGraph() can assemble one universal, evidence-backed graph. No I/O here.
// ============================================================================
import { normalizeKind, KIND_HE } from "./types";
import type { RawRelation } from "@/lib/relationship-graph/types";
import type { NodeSeed } from "@/lib/relationship-graph/graph";
import { RELATION_HE } from "@/lib/relationship-graph/types";

/** Minimal shape of an entity_relationships row (subset we read). */
export interface EntityRelationshipRow {
  source_entity_type: string; source_entity_id: string;
  target_entity_type: string; target_entity_id: string;
  relationship_type: string; strength_score: number | null;
  metadata: unknown; created_at: string | null; updated_at: string | null;
  status?: string | null;
}

/** Extract a human-readable name from a row's metadata, if present. */
function nameFrom(meta: unknown, side: "source" | "target"): string | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  const keys = side === "source"
    ? ["source_name", "sourceName", "source_label", "from_name"]
    : ["target_name", "targetName", "target_label", "to_name"];
  for (const k of keys) if (typeof m[k] === "string" && m[k]) return m[k] as string;
  return null;
}

/**
 * Map persisted relationship rows → { relations, seeds } for buildGraph().
 * Each row becomes one RawRelation; repeated rows aggregate downstream (buildEdge).
 */
export function relationsFromEntityRelationshipRows(rows: EntityRelationshipRow[]): { relations: RawRelation[]; seeds: NodeSeed[] } {
  const relations: RawRelation[] = [];
  const seedMap = new Map<string, NodeSeed>();
  const seed = (id: string, kind: string, name: string | null) => {
    if (!id) return;
    if (!seedMap.has(id)) seedMap.set(id, { id, type: kind, name: name ?? id });
    else if (name && seedMap.get(id)!.name === id) seedMap.get(id)!.name = name;
  };

  for (const r of rows) {
    if (r.status && r.status !== "active") continue;
    const fromType = normalizeKind(r.source_entity_type);
    const toType = normalizeKind(r.target_entity_type);
    const rel = (r.relationship_type ?? "related_to").trim() || "related_to";
    const relHe = RELATION_HE[rel] ?? rel;
    const strength = typeof r.strength_score === "number" ? r.strength_score : null;
    const at = r.updated_at ?? r.created_at ?? null;
    const fromName = nameFrom(r.metadata, "source");
    const toName = nameFrom(r.metadata, "target");
    seed(r.source_entity_id, fromType, fromName);
    seed(r.target_entity_id, toType, toName);
    relations.push({
      from: r.source_entity_id, to: r.target_entity_id, fromType, toType, type: rel, at,
      source: "entity_relationships",
      evidence: `${KIND_HE[fromType] ?? fromType} ${relHe} ${KIND_HE[toType] ?? toType}${strength != null ? ` · חוזק ${strength}` : ""}`,
    });
  }
  return { relations, seeds: [...seedMap.values()] };
}
