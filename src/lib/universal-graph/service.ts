// ============================================================================
// 🌐 ZONO — Universal Knowledge Graph — service (server-only). PHASE 51.0.
// Harvests the persisted `entity_relationships` edge store (written by every
// module) and assembles it with relationship-graph's buildGraph() into one
// universal, evidence-backed graph. REUSES: entityRelationshipRepository
// (activity layer), buildGraph + Truth-Engine-backed edges, and compute-cache.
// No new tables, no new graph engine, no writes. Org-scoped via RLS.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { entityRelationshipRepository } from "@/lib/activity/repository";
import { getCache, setCache } from "@/lib/platform-persistence/compute-cache";
import type { Json } from "@/lib/supabase/types";
import { buildGraph } from "@/lib/relationship-graph/graph";
import { relationsFromEntityRelationshipRows, type EntityRelationshipRow } from "./discovery";
import { relationshipSummary, buildContextPack, edgesOf } from "./query";
import { KIND_HE, entityHref, UNIVERSAL_GRAPH_VERSION, NO_FABRICATION_NOTE } from "./types";
import type { RelationshipSummary, EntityContextPack, UniversalGraphOverview, SummaryConnection } from "./types";

async function orgId(): Promise<string | null> {
  const { profile, organization } = await getSessionContext();
  return profile?.org_id ?? organization?.id ?? null;
}

/** All edges for one entity → relationship summary + AI context pack (evidence-backed). */
export async function getEntityRelationships(entityType: string, entityId: string, entityName?: string): Promise<{ summary: RelationshipSummary; pack: EntityContextPack }> {
  const rows = (await entityRelationshipRepository.listForEntity(entityType, entityId).catch(() => [])) as unknown as EntityRelationshipRow[];
  const { relations, seeds } = relationsFromEntityRelationshipRows(rows);
  const graph = buildGraph(seeds, relations);
  const summary = relationshipSummary(graph, entityId, entityName);
  const pack = buildContextPack(graph, entityId, entityName);
  pack.generatedAt = new Date().toISOString();
  return { summary, pack };
}

/** Org-wide universal graph overview (cached). */
export async function getUniversalGraphOverview(): Promise<UniversalGraphOverview> {
  const org = await orgId();
  if (org) {
    const hit = await getCache<UniversalGraphOverview>(org, "universal_graph_overview", []).catch(() => null);
    if (hit) return hit.value;
  }

  const supabase = await createClient();
  const { data } = await supabase.from("entity_relationships").select("*").eq("status", "active").limit(3000);
  const rows = (data ?? []) as unknown as EntityRelationshipRow[];
  const { relations, seeds } = relationsFromEntityRelationshipRows(rows);
  const graph = buildGraph(seeds, relations);

  const byKind = new Map<string, number>();
  for (const n of graph.nodes) byKind.set(String(n.type), (byKind.get(String(n.type)) ?? 0) + 1);

  const topConnected = [...graph.nodes]
    .sort((a, b) => b.degree - a.degree || b.weightedDegree - a.weightedDegree)
    .slice(0, 10)
    .map((n) => ({ id: n.id, name: n.name, kind: String(n.type), kindHe: KIND_HE[String(n.type)] ?? String(n.type), degree: n.degree }));

  const strongestEdges: SummaryConnection[] = [...graph.edges]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 8)
    .map((e) => ({
      id: e.to, kind: String(e.toType), kindHe: KIND_HE[String(e.toType)] ?? String(e.toType),
      name: graph.nodes.find((n) => n.id === e.to)?.name ?? e.to, relation: e.type, relationHe: e.type,
      direction: "out" as const, strength: e.strength, confidence: e.confidence, freshness: e.freshness,
      freshnessLevel: e.freshnessLevel, verification: e.verification, evidence: e.evidence, href: entityHref(String(e.toType), e.to),
    }));

  const overview: UniversalGraphOverview = {
    version: UNIVERSAL_GRAPH_VERSION, generatedAt: new Date().toISOString(),
    counts: {
      nodes: graph.counts.nodes, edges: graph.counts.edges,
      byKind: [...byKind.entries()].map(([kind, count]) => ({ kind, kindHe: KIND_HE[kind] ?? kind, count })).sort((a, b) => b.count - a.count),
    },
    topConnected, strongestEdges,
    hasData: graph.counts.edges > 0,
    notes: graph.counts.edges === 0 ? ["אין עדיין קשרים מתועדים בארגון. קשרים נוצרים אוטומטית ככל שנרשמת פעילות (שיחות, התאמות, פגישות, קמפיינים)."] : [NO_FABRICATION_NOTE],
  };

  if (org) await setCache(org, "universal_graph_overview", [], overview as unknown as Json, { ttlSeconds: 300, version: UNIVERSAL_GRAPH_VERSION }).catch(() => {});
  return overview;
}

/** Lightweight relationship answer for Ask ZONO (org graph headline). Evidence-only. */
export async function answerRelationshipQuestion(): Promise<{ answer: string; evidence: string[]; confidence: number }> {
  const ov = await getUniversalGraphOverview();
  if (!ov.hasData) return { answer: "אין עדיין קשרים מתועדים בגרף הידע. הקשרים ייבנו ככל שתירשם פעילות במערכת.", evidence: [], confidence: 40 };
  const top = ov.topConnected[0];
  const strongest = ov.strongestEdges.slice(0, 3).map((e) => `${e.name} (${e.kindHe}) · ביטחון ${e.confidence}`);
  const answer = `גרף הידע מחבר ${ov.counts.nodes} ישויות ב־${ov.counts.edges} קשרים מבוססי ראיות.${top ? ` הישות המקושרת ביותר: ${top.name} (${top.kindHe}, ${top.degree} קשרים).` : ""}`;
  return { answer, evidence: strongest, confidence: 70 };
}

/** Edge count for an entity (cheap helper for badges). */
export async function countEntityEdges(entityType: string, entityId: string): Promise<number> {
  const rows = (await entityRelationshipRepository.listForEntity(entityType, entityId).catch(() => [])) as unknown as EntityRelationshipRow[];
  const { relations, seeds } = relationsFromEntityRelationshipRows(rows);
  return edgesOf(buildGraph(seeds, relations), entityId).length;
}
