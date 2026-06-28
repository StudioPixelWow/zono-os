// ============================================================================
// ZONO Brokerage Knowledge — repository (server-only).
// RLS-scoped reads for the dashboard + graph explorer; service-role loaders for
// the recompute job. The single source of truth future AI queries instead of
// raw tables.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number => { const n = typeof v === "string" ? parseFloat(v) : (v as number); return Number.isFinite(n) ? (n as number) : 0; };
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export interface KnowledgeCompletenessRow { entityType: string; entityId: string; city: string | null; pct: number; missing: { key: string; label: string; weight: number }[]; suggestions: string[]; sourcesCount: number }
export interface KnowledgeClusterRow { id: string; entityType: string; city: string | null; confidence: number; masterEntityId: string | null; memberCount: number; recommendation: string | null; explanation: string | null; status: string; members: { entityId: string; similarity: number; isMaster: boolean; reasons: string[] }[] }
export interface KnowledgeMarketRow { scopeType: string; scopeKey: string; scopeLabel: string | null; city: string | null; listings: number; sharePct: number; growth: number; visibility: number; rank: number | null }
export interface KnowledgeHealthRow { healthy: number; needsReview: number; missingPhones: number; missingEmails: number; lowConfidence: number; duplicateClusters: number; inactiveOffices: number; coveragePct: number; freshnessHours: number | null; healthScore: number; createdAt: string }
export interface KnowledgeCoverageRow { city: string; estimatedOffices: number; knownOffices: number; coveragePct: number; knownAgents: number; missingOffices: number; missingAgents: number; confidence: number }
export interface KnowledgeDiscoveryRow { id: string; discoveryType: string; city: string | null; confidence: number; reasons: string[]; aiExplanation: string | null; status: string }
export interface KnowledgeGraphNode { id: string; nodeKey: string; nodeType: string; label: string; entityId: string | null; city: string | null }
export interface KnowledgeGraphEdge { srcNodeId: string; dstNodeId: string; edgeType: string; confidence: number }

export const knowledgeRepository = {
  async completeness(opts: { order?: "asc" | "desc"; limit?: number } = {}): Promise<KnowledgeCompletenessRow[]> {
    const db = await createClient();
    const { data } = await db.from("brokerage_completeness" as never).select("*")
      .order("completeness_pct", { ascending: opts.order !== "desc" }).limit(opts.limit ?? 60);
    return ((data ?? []) as Row[]).map((r) => ({
      entityType: String(r.entity_type), entityId: String(r.entity_id), city: s(r.city), pct: num(r.completeness_pct),
      missing: (Array.isArray(r.missing_fields) ? r.missing_fields : []) as { key: string; label: string; weight: number }[],
      suggestions: arr(r.suggestions), sourcesCount: num(r.sources_count),
    }));
  },
  async clusters(limit = 60): Promise<KnowledgeClusterRow[]> {
    const db = await createClient();
    const { data } = await db.from("brokerage_duplicate_clusters" as never).select("*").eq("status", "open")
      .order("cluster_confidence", { ascending: false }).limit(limit);
    const clusters = ((data ?? []) as Row[]).map((r) => ({
      id: String(r.id), entityType: String(r.entity_type), city: s(r.city), confidence: num(r.cluster_confidence),
      masterEntityId: s(r.master_entity_id), memberCount: num(r.member_count), recommendation: s(r.recommendation),
      explanation: s(r.ai_explanation), status: String(r.status), members: [] as KnowledgeClusterRow["members"],
    }));
    if (clusters.length) {
      const { data: mem } = await db.from("brokerage_duplicate_cluster_members" as never).select("*").in("cluster_id", clusters.map((c) => c.id));
      const byCluster = new Map<string, KnowledgeClusterRow["members"]>();
      for (const m of (mem ?? []) as Row[]) {
        const cid = String(m.cluster_id);
        (byCluster.get(cid) ?? byCluster.set(cid, []).get(cid)!).push({ entityId: String(m.entity_id), similarity: num(m.similarity), isMaster: m.is_master === true, reasons: arr(m.reasons) });
      }
      for (const c of clusters) c.members = byCluster.get(c.id) ?? [];
    }
    return clusters;
  },
  async marketShare(scopeType?: string, limit = 40): Promise<KnowledgeMarketRow[]> {
    const db = await createClient();
    let q = db.from("brokerage_market_share" as never).select("*").order("market_share_pct", { ascending: false }).limit(limit);
    if (scopeType) q = q.eq("scope_type", scopeType);
    const { data } = await q;
    return ((data ?? []) as Row[]).map((r) => ({
      scopeType: String(r.scope_type), scopeKey: String(r.scope_key), scopeLabel: s(r.scope_label), city: s(r.city),
      listings: num(r.listings_count), sharePct: num(r.market_share_pct), growth: num(r.growth_score), visibility: num(r.visibility_score),
      rank: r.rank == null ? null : num(r.rank),
    }));
  },
  async latestHealth(): Promise<KnowledgeHealthRow | null> {
    const db = await createClient();
    const { data } = await db.from("brokerage_data_health_snapshots" as never).select("*").eq("scope", "global").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!data) return null;
    const r = data as Row;
    const m = (r.metrics && typeof r.metrics === "object" ? r.metrics : {}) as Record<string, unknown>;
    return {
      healthy: num(r.healthy), needsReview: num(r.needs_review), missingPhones: num(r.missing_phones), missingEmails: num(r.missing_emails),
      lowConfidence: num(r.low_confidence), duplicateClusters: num(r.duplicate_clusters), inactiveOffices: num(r.inactive_offices),
      coveragePct: num(r.coverage_pct), freshnessHours: r.freshness_hours == null ? null : num(r.freshness_hours),
      healthScore: num(m.healthScore), createdAt: String(r.created_at),
    };
  },
  async coverage(limit = 60): Promise<KnowledgeCoverageRow[]> {
    const db = await createClient();
    const { data } = await db.from("brokerage_coverage" as never).select("*").order("coverage_pct", { ascending: true }).limit(limit);
    return ((data ?? []) as Row[]).map((r) => ({
      city: String(r.city), estimatedOffices: num(r.estimated_offices), knownOffices: num(r.known_offices), coveragePct: num(r.coverage_pct),
      knownAgents: num(r.known_agents), missingOffices: num(r.missing_offices), missingAgents: num(r.missing_agents), confidence: num(r.confidence),
    }));
  },
  async discoveries(limit = 60): Promise<KnowledgeDiscoveryRow[]> {
    const db = await createClient();
    const { data } = await db.from("brokerage_relationship_discoveries" as never).select("*").eq("status", "pending").order("confidence", { ascending: false }).limit(limit);
    return ((data ?? []) as Row[]).map((r) => ({
      id: String(r.id), discoveryType: String(r.discovery_type), city: s(r.city), confidence: num(r.confidence),
      reasons: arr(r.reasons), aiExplanation: s(r.ai_explanation), status: String(r.status),
    }));
  },
  /** Graph neighborhood around an office/agent node (1-hop) for the explorer. */
  async graphAround(entityType: "office" | "agent", entityId: string): Promise<{ nodes: KnowledgeGraphNode[]; edges: KnowledgeGraphEdge[] }> {
    const db = await createClient();
    const nodeKey = `${entityType}:${entityId}`;
    const { data: center } = await db.from("brokerage_graph_nodes" as never).select("*").eq("node_key", nodeKey).maybeSingle();
    if (!center) return { nodes: [], edges: [] };
    const centerId = String((center as Row).id);
    const { data: edgeRows } = await db.from("brokerage_graph_edges" as never).select("*").or(`src_node_id.eq.${centerId},dst_node_id.eq.${centerId}`).limit(200);
    const edges = ((edgeRows ?? []) as Row[]).map((e) => ({ srcNodeId: String(e.src_node_id), dstNodeId: String(e.dst_node_id), edgeType: String(e.edge_type), confidence: num(e.confidence) }));
    const ids = new Set<string>([centerId]);
    for (const e of edges) { ids.add(e.srcNodeId); ids.add(e.dstNodeId); }
    const { data: nodeRows } = await db.from("brokerage_graph_nodes" as never).select("id,node_key,node_type,label,entity_id,city").in("id", [...ids]);
    const nodes = ((nodeRows ?? []) as Row[]).map((n) => ({ id: String(n.id), nodeKey: String(n.node_key), nodeType: String(n.node_type), label: String(n.label ?? ""), entityId: s(n.entity_id), city: s(n.city) }));
    return { nodes, edges };
  },
};
