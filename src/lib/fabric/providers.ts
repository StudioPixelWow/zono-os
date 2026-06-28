// ============================================================================
// ZONO INTELLIGENCE FABRIC™ — producer adapters (server-only orchestration).
// ----------------------------------------------------------------------------
// The glue that turns EXISTING engines into Fabric producers WITHOUT rewriting
// them and WITHOUT engines importing each other. Each adapter reuses an engine's
// already-RLS-scoped repository/service and maps its output into the shared
// ProducerContribution shape. New engines self-register here (or call
// registerProducer from their own module) — the Knowledge API automatically
// picks them up. Nothing here duplicates business logic; it only translates.
// ============================================================================
import "server-only";
import { registerProducer } from "./registry";
import type { EntityRef, RelationshipEdge, TimelineEntry } from "./types";
import { makeEdge } from "./relationships";
import { activityScore, growthScore, clamp } from "./metrics";
import { knowledgeRepository, type KnowledgeGraphNode } from "@/lib/brokerage-data/knowledge/repository";
import { evolutionRepository } from "@/lib/brokerage-data/evolution/repository";

let registered = false;

/** Map a knowledge-graph node to a Fabric entity ref (best-effort). */
function nodeToRef(n: KnowledgeGraphNode): EntityRef | null {
  const type = n.nodeType === "office" ? "office" : n.nodeType === "agent" ? "agent" : n.nodeType === "city" ? "market" : n.nodeType === "listing" ? "listing" : null;
  if (!type) return null;
  return { type, id: n.entityId ?? n.nodeKey, label: n.label, city: n.city };
}

/**
 * Idempotently register every built-in producer. Called by the Knowledge API on
 * first use. Adding a new engine = add one registerProducer() block here (or in
 * the engine's own module) — zero changes to the Fabric core.
 */
export function ensureProvidersRegistered(): void {
  if (registered) return;
  registered = true;

  // ── Brokerage EVOLUTION DNA → office / agent intelligence ─────────────────
  registerProducer({
    name: "brokerage-evolution",
    types: ["office", "agent"],
    resolve: async (ref) => {
      if (ref.type !== "office" && ref.type !== "agent") return {};
      const dna = await evolutionRepository.dnaFor(ref.type, ref.id);
      const series = await evolutionRepository.seriesForKey(`${ref.type}:${ref.id}`);
      if (!dna && !series.length) return {};
      const timeline: TimelineEntry[] = series.slice(-6).map((s, i) => ({
        id: `evo_${ref.id}_${s.periodDate}_${i}`, at: `${s.periodDate}T00:00:00.000Z`,
        type: ref.type === "office" ? "office_changed" : "agent_changed",
        title: `מלאי ${s.listings} · פעילות ${Math.round(s.activity)}`,
        detail: s.city, entity: ref, city: s.city, source: "brokerage-evolution",
      }));
      const last = series[series.length - 1], prev = series[series.length - 2];
      const metrics = {
        confidence: dna?.confidence ?? 0,
        activity: last ? activityScore(last.activity) : 0,
        growth: last && prev ? growthScore(prev.listings, last.listings) : 0,
      };
      return {
        data: dna ? { dna: dna.dna, career: dna.career } : {},
        metrics,
        confidence: dna ? [{ source: "ZONO Evolution DNA", value: dna.confidence, weight: 2, sampleSize: dna.evidence.length }] : [],
        timeline,
        sources: ["ZONO Evolution Intelligence"],
        reasons: dna?.evidence ?? [],
        lastUpdate: last ? `${last.periodDate}T00:00:00.000Z` : null,
      };
    },
  });

  // ── Brokerage KNOWLEDGE GRAPH → relationships + completeness ───────────────
  registerProducer({
    name: "brokerage-knowledge",
    types: ["office", "agent"],
    resolve: async (ref) => {
      if (ref.type !== "office" && ref.type !== "agent") return {};
      const graph = await knowledgeRepository.graphAround(ref.type, ref.id);
      const byId = new Map(graph.nodes.map((n) => [n.id, n]));
      const relationships: RelationshipEdge[] = [];
      for (const e of graph.edges) {
        const a = byId.get(e.srcNodeId), b = byId.get(e.dstNodeId);
        if (!a || !b) continue;
        const fromRef = nodeToRef(a), toRef = nodeToRef(b);
        if (!fromRef || !toRef) continue;
        relationships.push(makeEdge({ from: fromRef, to: toRef, type: "related_to", strength: clamp(e.confidence), confidence: clamp(e.confidence), reasons: [e.edgeType], source: "knowledge-graph" }));
      }
      // Completeness for this entity (the single source of truth for the metric).
      const comp = await knowledgeRepository.completeness({ order: "asc", limit: 400 });
      const mine = comp.find((c) => c.entityId === ref.id && c.entityType === ref.type);
      return {
        relationships,
        metrics: mine ? { completeness: mine.pct } : {},
        confidence: mine ? [{ source: "ZONO Knowledge completeness", value: mine.pct, weight: 1, sampleSize: mine.sourcesCount }] : [],
        sources: ["ZONO Brokerage Knowledge Graph"],
        reasons: mine && mine.missing.length ? [`חסר: ${mine.missing.slice(0, 3).map((m) => m.label).join(", ")}`] : [],
      };
    },
  });

  // ── Brokerage EVOLUTION → neighborhood / market intelligence ──────────────
  registerProducer({
    name: "brokerage-market",
    types: ["neighborhood", "market"],
    resolve: async (ref) => {
      if (ref.type === "neighborhood") {
        const [city, neighborhood] = ref.id.includes("|") ? ref.id.split("|") : [ref.city ?? "", ref.id];
        const rows = await evolutionRepository.neighborhoodLeaders(200);
        const row = rows.find((r) => r.neighborhood === neighborhood && (!city || r.city === city));
        if (!row) return {};
        return {
          data: { neighborhood: row },
          metrics: { competition: row.competitionLevel === "high" ? 80 : row.competitionLevel === "medium" ? 50 : 20, confidence: row.confidence, activity: activityScore(row.listingVolume) },
          confidence: [{ source: "ZONO Neighborhood Dominance", value: row.confidence, weight: 1, sampleSize: row.listingVolume }],
          sources: ["ZONO Evolution — Neighborhood Dominance"],
          reasons: [`${row.listingVolume} מודעות · נתח מוביל ${row.marketShare}%`],
        };
      }
      // market = city
      const rows = await evolutionRepository.marketDna(200);
      const row = rows.find((r) => r.city === (ref.city ?? ref.id) || r.city === ref.id);
      if (!row) return {};
      return {
        data: { market: row },
        metrics: { competition: row.competitionIntensity, influence: clamp(row.officeDensity * 4) },
        confidence: [{ source: "ZONO Market DNA", value: clamp(50 + row.competitionIntensity / 2), weight: 1 }],
        sources: ["ZONO Evolution — Market DNA"],
        reasons: [`קטגוריה מובילה ${row.dominantOfficeCategory ?? "—"} · עצמת תחרות ${row.competitionIntensity}%`],
      };
    },
  });
}
