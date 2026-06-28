// ============================================================================
// ZONO INTELLIGENCE FABRIC™ — Shared Context Engine (server-only).
// ----------------------------------------------------------------------------
// Assembles a COMPLETE context for any entity in one call: the entity's own
// knowledge plus its neighbouring contexts (broker → neighborhood → market →
// seller → buyer → competition → opportunity → timeline), composed lazily and
// memoized. The caller receives one unified knowledge object — exactly what a
// future AI agent needs, with RLS preserved and full explainability throughout.
//
//   Property ▸ Broker ▸ Neighborhood ▸ Market ▸ Seller ▸ Buyer ▸ Competition
//            ▸ Opportunity ▸ Decision ▸ Timeline   → one ContextBundle
// ============================================================================
import "server-only";
import type { EntityRef, KnowledgeObject, TimelineEntry, RelationshipEdge, ComposedConfidence } from "./types";
import { getKnowledge } from "./knowledge";
import { neighborsOf, dedupeEdges } from "./relationships";
import { mergeTimeline } from "./timeline";
import { composeConfidence } from "./confidence";
import { entityKey } from "./types";
import { cacheKey, memo } from "./cache";

export interface ContextBundle {
  root: KnowledgeObject;
  related: KnowledgeObject[];
  relationships: RelationshipEdge[];
  timeline: TimelineEntry[];
  confidence: ComposedConfidence;
  /** Provenance — every producer that fed this context. */
  producers: string[];
  assembledAt: string;
}

const MAX_RELATED = 6; // bound the fan-out

/**
 * Build the unified context for an entity. Expands one hop along the strongest
 * relationships (and the entity's city as a market/neighborhood node), fetching
 * each neighbour's knowledge through the same Fabric — never a direct engine
 * call. Cached; failures isolated per neighbour.
 */
export async function assembleContext(ref: EntityRef): Promise<ContextBundle> {
  return memo(cacheKey("context", ref), async () => {
    const root = await getKnowledge(ref);

    // Candidate neighbours: strongest graph neighbours + the entity's city.
    const candidates: EntityRef[] = neighborsOf(ref, root.relationships).slice(0, MAX_RELATED);
    if (ref.city) {
      const cityKey = entityKey({ type: "market", id: ref.city });
      if (!candidates.some((c) => entityKey(c) === cityKey)) candidates.push({ type: "market", id: ref.city, city: ref.city, label: ref.city });
    }
    const seen = new Set([entityKey(ref)]);
    const unique = candidates.filter((c) => { const k = entityKey(c); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, MAX_RELATED);

    const related = await Promise.all(unique.map(async (r) => {
      try { return await getKnowledge(r); } catch { return null; }
    }));
    const relatedKnowledge = related.filter((r): r is KnowledgeObject => !!r);

    const relationships = dedupeEdges([root, ...relatedKnowledge].flatMap((k) => k.relationships));
    const timeline = mergeTimeline([root, ...relatedKnowledge].flatMap((k) => k.timeline), 60);
    const confidence = composeConfidence([root, ...relatedKnowledge].flatMap((k) => k.confidence.signals));
    const producers = [...new Set([root, ...relatedKnowledge].flatMap((k) => k.producers))];

    return { root, related: relatedKnowledge, relationships, timeline, confidence, producers, assembledAt: new Date().toISOString() };
  }, { type: ref.type, ttlMs: 2 * 60_000 });
}
