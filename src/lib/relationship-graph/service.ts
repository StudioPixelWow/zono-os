// ============================================================================
// 🕸️ ZONO Relationship Intelligence™ — service (server-only). 27.9.
// Builds the Universal Entity Graph from EXISTING evidence (listing links,
// agent→office records, mission history), then runs network analysis, the
// executive dashboard, Chief-of-Staff answers and decision influence. Read-only
// over every source; evidence-only; no schema changes; no engine modified.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActionCenter, type Mission } from "../mission-engine";
import { buildGraph, type NodeSeed } from "./graph";
import { analyzeNetwork } from "./network";
import { relationsFromLinks, relationsFromAgents, relationsFromMissions, type LinkRel, type AgentRel, type MissionRel } from "./discovery";
import { buildRelationshipAnswers } from "./chief-of-staff";
import { relationshipInfluences } from "./decision-influence";
import { buildExecutiveGraph } from "./executive";
import { RELATIONSHIP_GRAPH_VERSION, type RelationshipReport, type RawRelation } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const MAX_LINKS = 8000, MAX_OFFICES = 300, MAX_AGENTS = 800, MAX_EDGES_OUT = 300, MAX_NODES_OUT = 300;

/** The unified Relationship report. Read-only over the brokerage graph + missions. */
export async function getRelationshipReport(orgId: string | null): Promise<RelationshipReport> {
  const db = createServiceRoleClient();
  const notes: string[] = [];

  const safe = async (table: string, columns: string, limit: number): Promise<Row[]> => {
    try { const { data } = await db.from(table as never).select(columns).limit(limit); return (data ?? []) as Row[]; }
    catch { return []; }
  };

  const [officeRows, agentRows, linkRows] = await Promise.all([
    safe("brokerage_offices", "id,name", MAX_OFFICES),
    safe("brokerage_agents", "id,full_name,office_id,city", MAX_AGENTS),
    safe("brokerage_external_listing_links", "office_id,agent_id,external_listing_id,city,matched_source,last_seen_at,created_at", MAX_LINKS),
  ]);

  // Missions (read-only via Action Center buckets).
  let missions: Mission[] = [];
  try {
    const ac = await getActionCenter(orgId);
    if (ac.notes?.length) notes.push(...ac.notes);
    const union = new Map<string, Mission>();
    for (const b of [ac.completed, ac.recentlyCreated, ac.critical, ac.highPriority, ac.inProgress, ac.blocked, ac.waiting]) for (const m of b) if (!union.has(m.id)) union.set(m.id, m);
    missions = [...union.values()];
  } catch { /* missions optional */ }

  // ── Node seeds (names) ───────────────────────────────────────────────────────
  const seeds = new Map<string, NodeSeed>();
  const seed = (id: string, type: NodeSeed["type"], name: string) => { if (!seeds.has(id)) seeds.set(id, { id, type, name }); };
  for (const o of officeRows) { const id = s(o.id); if (id) seed(id, "office", s(o.name) ?? id); }
  for (const a of agentRows) { const id = s(a.id); if (id) seed(id, "broker", s(a.full_name) ?? id); }

  const links: LinkRel[] = linkRows.map((r) => ({
    agentId: s(r.agent_id), officeId: s(r.office_id), listingId: s(r.external_listing_id),
    city: s(r.city), source: s(r.matched_source), at: s(r.last_seen_at) ?? s(r.created_at),
  }));
  for (const l of links) {
    if (l.listingId) seed(l.listingId, "listing", `מודעה ${l.listingId.slice(0, 8)}`);
    if (l.city) seed(`city:${l.city}`, "market", l.city);
  }
  const agents: AgentRel[] = agentRows.map((r) => ({ id: s(r.id) ?? "", officeId: s(r.office_id), city: s(r.city) })).filter((a) => a.id);

  const missionRels: MissionRel[] = missions.map((m) => ({
    id: m.id, entityId: m.entityId, entityType: m.entityType, missionType: m.missionType,
    sourceDecision: m.sourceDecision, status: m.status, createdAt: m.createdAt, completedAt: m.completedAt,
  }));
  for (const m of missions) {
    seed(m.id, "mission", m.goal || m.missionType);
    if (m.entityId) seed(m.entityId, m.entityType, m.entityName ?? m.entityId);
    if (m.sourceDecision) seed(`decision:${m.sourceDecision}`, "decision", "החלטה");
  }

  // ── Relationship discovery (evidence-only) ───────────────────────────────────
  const relations: RawRelation[] = [
    ...relationsFromLinks(links),
    ...relationsFromAgents(agents),
    ...relationsFromMissions(missionRels),
  ];

  const graph = buildGraph([...seeds.values()], relations);
  const network = analyzeNetwork(graph);
  const executive = buildExecutiveGraph(graph, network);
  const chiefOfStaffAnswers = buildRelationshipAnswers(graph);
  const decisionInfluences = relationshipInfluences(graph).slice(0, 20);

  if (!graph.edges.length) notes.push("אין עדיין קשרים — הפעל שיוך נכסי סוכנים/מחקר עיר כדי לבנות את הגרף. אין קשרים מומצאים.");

  // Trim the payload (analysis already computed on the full graph).
  const trimmedNodes = [...graph.nodes].sort((a, b) => b.degree - a.degree).slice(0, MAX_NODES_OUT);
  const trimmedEdges = [...graph.edges].sort((a, b) => b.strength - a.strength).slice(0, MAX_EDGES_OUT);

  return {
    version: RELATIONSHIP_GRAPH_VERSION, orgId, generatedAt: new Date().toISOString(),
    graph: { nodes: trimmedNodes, edges: trimmedEdges, counts: graph.counts },
    network, executive, chiefOfStaffAnswers, decisionInfluences, notes,
  };
}
