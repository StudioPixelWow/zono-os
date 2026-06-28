// ============================================================================
// ZONO INTELLIGENCE FABRIC™ — Shared Knowledge API (server-only).
// ----------------------------------------------------------------------------
// The Single Source of Truth read interface. getKnowledge() fans a request out
// to every registered producer for the entity, merges their contributions into
// ONE explainable KnowledgeObject (data + metrics + composed confidence + a full
// explanation + relationships + timeline), and memoizes it. Future AI agents and
// future modules consume THESE functions — never raw tables. RLS is preserved
// because producers read through the caller's request-scoped clients.
// ============================================================================
import "server-only";
import { ensureProvidersRegistered } from "./providers";
import { gather } from "./registry";
import type {
  EntityRef, FabricEntityType, KnowledgeObject, ConfidenceSignal,
  RelationshipEdge, TimelineEntry, MetricSet,
} from "./types";
import { mergeMetrics } from "./metrics";
import { composeConfidence } from "./confidence";
import { buildFabricExplanation, freshest } from "./explain";
import { dedupeEdges } from "./relationships";
import { mergeTimeline } from "./timeline";
import { cacheKey, memo } from "./cache";
import type { ExplainableScoreType } from "@/lib/explainability/types";

const SCORE_TYPE: Partial<Record<FabricEntityType, ExplainableScoreType>> = {
  property: "property_exposure", listing: "property_exposure", buyer: "buyer_match",
  seller: "seller_confidence", market: "market_opportunity", neighborhood: "market_opportunity",
  territory: "territory", opportunity: "opportunity",
};

/** Assemble the unified knowledge object for one entity (cached, explainable). */
export async function getKnowledge<T = Record<string, unknown>>(ref: EntityRef): Promise<KnowledgeObject<T>> {
  ensureProvidersRegistered();
  return memo(cacheKey("knowledge", ref), async () => {
    const contributions = await gather(ref);
    const producers = contributions.filter((c) => Object.keys(c.contribution).length).map((c) => c.name);

    const data: Record<string, unknown> = {};
    const metricSets: MetricSet[] = [];
    const confSignals: ConfidenceSignal[] = [];
    const edges: RelationshipEdge[] = [];
    const timeline: TimelineEntry[] = [];
    const sources = new Set<string>();
    const reasons: string[] = [];
    let lastUpdate: string | null = null;

    for (const { name, contribution: c } of contributions) {
      if (c.data) data[name] = c.data;
      if (c.metrics) metricSets.push(c.metrics);
      if (c.confidence) confSignals.push(...c.confidence);
      if (c.relationships) edges.push(...c.relationships);
      if (c.timeline) timeline.push(...c.timeline);
      if (c.sources) c.sources.forEach((s) => sources.add(s));
      if (c.reasons) reasons.push(...c.reasons);
      lastUpdate = freshest(lastUpdate, c.lastUpdate);
    }

    const metrics = mergeMetrics(...metricSets);
    const confidence = composeConfidence(confSignals);
    const relationships = dedupeEdges(edges);
    const relatedEntities = relationships.slice(0, 12).flatMap((e) => [e.from, e.to]).filter((r) => `${r.type}:${r.id}` !== `${ref.type}:${ref.id}`);

    const explanation = producers.length
      ? buildFabricExplanation({
          scoreType: SCORE_TYPE[ref.type] ?? "opportunity",
          score: metrics.confidence ?? confidence.value,
          entity: ref,
          reasons: reasons.length ? reasons : [confidence.explanation],
          confidence,
          sources: [...sources],
          reasoning: reasons[0] ?? confidence.explanation,
          lastUpdate,
          relatedEntities: relatedEntities.slice(0, 8),
        })
      : null;

    return {
      ref, data: data as T, metrics, confidence, explanation,
      relationships, timeline: mergeTimeline(timeline, 40),
      producers, assembledAt: new Date().toISOString(),
    } satisfies KnowledgeObject<T>;
  }, { type: ref.type, ttlMs: 3 * 60_000 });
}

// ── Named Knowledge accessors (the official, reusable surface) ──────────────
const ref = (type: FabricEntityType) => (id: string, city?: string | null, label?: string): EntityRef => ({ type, id, city: city ?? null, label });

export const getPropertyKnowledge     = (id: string, city?: string | null) => getKnowledge(ref("property")(id, city));
export const getListingKnowledge      = (id: string, city?: string | null) => getKnowledge(ref("listing")(id, city));
export const getBrokerKnowledge       = (id: string, city?: string | null) => getKnowledge(ref("broker")(id, city));
export const getOfficeKnowledge       = (id: string, city?: string | null) => getKnowledge(ref("office")(id, city));
export const getAgentKnowledge        = (id: string, city?: string | null) => getKnowledge(ref("agent")(id, city));
export const getNeighborhoodKnowledge = (id: string, city?: string | null) => getKnowledge(ref("neighborhood")(id, city));
export const getMarketKnowledge       = (id: string, city?: string | null) => getKnowledge(ref("market")(id, city));
export const getSellerKnowledge       = (id: string, city?: string | null) => getKnowledge(ref("seller")(id, city));
export const getBuyerKnowledge        = (id: string, city?: string | null) => getKnowledge(ref("buyer")(id, city));
export const getOpportunityKnowledge  = (id: string, city?: string | null) => getKnowledge(ref("opportunity")(id, city));
export const getCompetitionKnowledge  = (id: string, city?: string | null) => getKnowledge(ref("competition")(id, city));
export const getRelationshipKnowledge = async (id: string, type: FabricEntityType = "office", city?: string | null) =>
  (await getKnowledge(ref(type)(id, city))).relationships;
export const getTimelineKnowledge     = async (id: string, type: FabricEntityType = "office", city?: string | null) =>
  (await getKnowledge(ref(type)(id, city))).timeline;
