// ============================================================================
// ZONO — PHASE 26.9: RAIN graph repository (SERVER-ONLY). Org-scoped.
// Idempotent upserts: a node is keyed by (org, node_type, entity_id); an edge by
// (org, source_node_id, target_node_id, edge_type). Re-running overwrites in
// place (last_seen_at refreshed) — never duplicates. RLS enforces org isolation.
// ============================================================================
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  RainNode, RainEdge, RainNodeType, RainEdgeType, RainConfidence,
  RainNodeFilters, RainEdgeFilters, UpsertNodeInput, UpsertEdgeInput,
} from "./rainTypes";

// Untyped client is fine here — RLS + explicit org stamping enforce safety, and
// the new tables are recent additions to the generated Database type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;
type Obj = Record<string, unknown>;

const NODE_COLS = "id,organization_id,node_type,entity_id,label,subtitle,city,neighborhood,street,importance_score,confidence,metadata,created_at,updated_at";
const EDGE_COLS = "id,organization_id,source_node_id,target_node_id,edge_type,strength,confidence,evidence,active,first_seen_at,last_seen_at,created_at,updated_at";

const num = (v: unknown): number | null => (v == null ? null : Number(v));
const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const asConf = (v: unknown): RainConfidence => (v === "high" || v === "medium" ? v : "low");

export function toNode(r: Obj): RainNode {
  return {
    id: r.id as string, nodeType: r.node_type as RainNodeType, entityId: r.entity_id as string,
    label: r.label as string, subtitle: (r.subtitle as string) ?? null,
    city: (r.city as string) ?? null, neighborhood: (r.neighborhood as string) ?? null,
    street: (r.street as string) ?? null, importanceScore: num(r.importance_score),
    confidence: asConf(r.confidence), metadata: asObj(r.metadata),
  };
}
export function toEdge(r: Obj): RainEdge {
  return {
    id: r.id as string, sourceNodeId: r.source_node_id as string, targetNodeId: r.target_node_id as string,
    edgeType: r.edge_type as RainEdgeType, strength: num(r.strength), confidence: asConf(r.confidence),
    evidence: asObj(r.evidence), active: r.active !== false,
  };
}

// ── Writes ───────────────────────────────────────────────────────────────────
export async function upsertNode(db: DB, organizationId: string, input: UpsertNodeInput): Promise<{ node: RainNode; created: boolean }> {
  const existing = await getNodeByEntity(db, organizationId, input.nodeType, input.entityId);
  const now = new Date().toISOString();
  const { data, error } = await db.from("rain_nodes").upsert({
    organization_id: organizationId, node_type: input.nodeType, entity_id: input.entityId,
    label: input.label, subtitle: input.subtitle ?? null, city: input.city ?? null,
    neighborhood: input.neighborhood ?? null, street: input.street ?? null,
    importance_score: input.importanceScore, confidence: input.confidence,
    metadata: input.metadata ?? {}, updated_at: now,
  }, { onConflict: "organization_id,node_type,entity_id" }).select(NODE_COLS).single();
  if (error) throw new Error(error.message);
  return { node: toNode(data as Obj), created: !existing };
}

export async function upsertEdge(db: DB, organizationId: string, input: UpsertEdgeInput): Promise<{ edge: RainEdge; created: boolean }> {
  const existing = await getEdge(db, organizationId, input.sourceNodeId, input.targetNodeId, input.edgeType);
  const now = new Date().toISOString();
  const { data, error } = await db.from("rain_edges").upsert({
    organization_id: organizationId, source_node_id: input.sourceNodeId, target_node_id: input.targetNodeId,
    edge_type: input.edgeType, strength: input.strength, confidence: input.confidence,
    evidence: input.evidence ?? {}, active: input.active ?? true,
    first_seen_at: existing ? undefined : now, last_seen_at: now, updated_at: now,
  }, { onConflict: "organization_id,source_node_id,target_node_id,edge_type" }).select(EDGE_COLS).single();
  if (error) throw new Error(error.message);
  return { edge: toEdge(data as Obj), created: !existing };
}

// ── Reads ────────────────────────────────────────────────────────────────────
export async function getNodeByEntity(db: DB, organizationId: string, nodeType: RainNodeType, entityId: string): Promise<RainNode | null> {
  const { data } = await db.from("rain_nodes").select(NODE_COLS)
    .eq("organization_id", organizationId).eq("node_type", nodeType).eq("entity_id", entityId).maybeSingle();
  return data ? toNode(data as Obj) : null;
}

export async function getNodeById(db: DB, organizationId: string, id: string): Promise<RainNode | null> {
  const { data } = await db.from("rain_nodes").select(NODE_COLS)
    .eq("organization_id", organizationId).eq("id", id).maybeSingle();
  return data ? toNode(data as Obj) : null;
}

export async function listNodes(db: DB, organizationId: string, filters: RainNodeFilters = {}): Promise<RainNode[]> {
  let req = db.from("rain_nodes").select(NODE_COLS).eq("organization_id", organizationId);
  if (filters.nodeType) req = req.eq("node_type", filters.nodeType);
  if (filters.city) req = req.eq("city", filters.city);
  if (filters.neighborhood) req = req.eq("neighborhood", filters.neighborhood);
  req = req.order("importance_score", { ascending: false, nullsFirst: false }).limit(Math.min(filters.limit ?? 500, 2000));
  const { data } = await req;
  return ((data as Obj[] | null) ?? []).map(toNode);
}

export async function getEdge(db: DB, organizationId: string, sourceNodeId: string, targetNodeId: string, edgeType: RainEdgeType): Promise<RainEdge | null> {
  const { data } = await db.from("rain_edges").select(EDGE_COLS)
    .eq("organization_id", organizationId).eq("source_node_id", sourceNodeId)
    .eq("target_node_id", targetNodeId).eq("edge_type", edgeType).maybeSingle();
  return data ? toEdge(data as Obj) : null;
}

export async function listEdges(db: DB, organizationId: string, filters: RainEdgeFilters = {}): Promise<RainEdge[]> {
  let req = db.from("rain_edges").select(EDGE_COLS).eq("organization_id", organizationId);
  if (filters.edgeType) req = req.eq("edge_type", filters.edgeType);
  if (filters.activeOnly) req = req.eq("active", true);
  if (filters.nodeId) req = req.or(`source_node_id.eq.${filters.nodeId},target_node_id.eq.${filters.nodeId}`);
  req = req.order("strength", { ascending: false, nullsFirst: false }).limit(Math.min(filters.limit ?? 1000, 4000));
  const { data } = await req;
  return ((data as Obj[] | null) ?? []).map(toEdge);
}

export async function countNodes(db: DB, organizationId: string, nodeType?: RainNodeType): Promise<number> {
  let req = db.from("rain_nodes").select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
  if (nodeType) req = req.eq("node_type", nodeType);
  const { count } = await req;
  return count ?? 0;
}

export async function countEdges(db: DB, organizationId: string): Promise<number> {
  const { count } = await db.from("rain_edges").select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
  return count ?? 0;
}
