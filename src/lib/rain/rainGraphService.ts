// ============================================================================
// ZONO — PHASE 26.9: RAIN graph service (SERVER-ONLY). The typed public API for
// the strategic intelligence graph. Build from real data + UI-ready reads. All
// reads return the { nodes, edges, stats, confidence } payload. Org isolation is
// enforced by RLS; functions accept organizationId for explicit, testable calls.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { buildRainGraph, type BuildRainOptions, type BuildRainResult } from "./rainGraphBuilder";
import { getRainGraphPayload, getSubgraphPayload, buildStats, buildConfidence } from "./rainGraphQueries";
import { listNodes, listEdges, getNodeByEntity } from "./rainRepository";
import type { RainGraph, RainNode, RainEdge, RainNodeFilters, RainEdgeFilters, RainStats, RainConfidenceSummary } from "./rainTypes";

const lc = (v: string): string => v.trim().toLowerCase().replace(/\s+/g, " ");

/** (Re)build the RAIN graph for an organization from real internal data. */
export async function buildRainGraphForOrganization(organizationId: string, opts: BuildRainOptions = {}): Promise<BuildRainResult> {
  const db = await createClient();
  return buildRainGraph(db, organizationId, opts);
}

/** Lightweight overview: stats + confidence summary. */
export async function getRainGraphOverview(organizationId: string): Promise<{ stats: RainStats; confidence: RainConfidenceSummary }> {
  const db = await createClient();
  const [nodes, edges] = await Promise.all([
    listNodes(db, organizationId, { limit: 2000 }),
    listEdges(db, organizationId, { limit: 4000 }),
  ]);
  return { stats: buildStats(nodes, edges), confidence: buildConfidence(nodes) };
}

export async function getRainNodes(organizationId: string, filters: RainNodeFilters = {}): Promise<RainNode[]> {
  const db = await createClient();
  return listNodes(db, organizationId, filters);
}

export async function getRainEdges(organizationId: string, filters: RainEdgeFilters = {}): Promise<RainEdge[]> {
  const db = await createClient();
  return listEdges(db, organizationId, filters);
}

/** Full UI-ready graph payload (bounded). */
export async function getRainGraph(organizationId: string, opts: { nodeLimit?: number; edgeLimit?: number } = {}): Promise<RainGraph> {
  const db = await createClient();
  return getRainGraphPayload(db, organizationId, opts);
}

export async function getRainSubgraph(organizationId: string, centerNodeId: string, depth = 1): Promise<RainGraph> {
  const db = await createClient();
  return getSubgraphPayload(db, organizationId, centerNodeId, depth);
}

/** Network around one agency (its agents, territories, signals, linked entities). */
export async function getRainAgencyNetwork(organizationId: string, agencyId: string, depth = 2): Promise<RainGraph> {
  const db = await createClient();
  const node = await getNodeByEntity(db, organizationId, "agency", agencyId);
  if (!node) return getSubgraphPayload(db, organizationId, "__none__", 0);
  return getSubgraphPayload(db, organizationId, node.id, depth);
}

/** Network around a territory (agencies dominating it and their agents). */
export async function getRainTerritoryNetwork(organizationId: string, city: string, neighborhood?: string | null, depth = 2): Promise<RainGraph> {
  const db = await createClient();
  const entityId = neighborhood ? `neighborhood:${lc(city)}/${lc(neighborhood)}` : `city:${lc(city)}`;
  const nodeType = neighborhood ? "neighborhood" : "city";
  const node = await getNodeByEntity(db, organizationId, nodeType, entityId);
  if (!node) return getSubgraphPayload(db, organizationId, "__none__", 0);
  return getSubgraphPayload(db, organizationId, node.id, depth);
}

/** Network around a single signal (the agency that triggered it). */
export async function getRainSignalNetwork(organizationId: string, signalId: string, depth = 1): Promise<RainGraph> {
  const db = await createClient();
  const node = await getNodeByEntity(db, organizationId, "signal", signalId);
  if (!node) return getSubgraphPayload(db, organizationId, "__none__", 0);
  return getSubgraphPayload(db, organizationId, node.id, depth);
}
