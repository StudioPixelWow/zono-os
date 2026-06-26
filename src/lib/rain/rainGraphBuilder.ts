// ============================================================================
// ZONO — PHASE 26.9: RAIN graph builder (SERVER-ONLY).
// Constructs the strategic graph from EXISTING ZONO data only. Never invents
// nodes or edges: if a source entity doesn't exist, no node is created. All
// importance / strength values come from real metrics (NULL when not enough
// data). Idempotent — re-running upserts in place. No external scraping.
// ============================================================================
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertNode, upsertEdge } from "./rainRepository";
import {
  scoreAgencyNode, scoreAgentNode, scorePropertyNode, scoreTerritoryNode,
  scoreSignalNode, severityWeight, scoreEdgeStrength, clamp100,
} from "./rainGraphScoring";
import type {
  RainNodeType, RainEdgeType, RainConfidence, UpsertNodeInput, UpsertEdgeInput,
} from "./rainTypes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;
type Obj = Record<string, unknown>;

export interface BuildRainOptions {
  maxAgencies?: number;
  maxProperties?: number;
  maxDeals?: number;
  maxProjects?: number;
  maxSignals?: number;
}
export interface BuildRainResult {
  nodesCreated: number;
  nodesUpdated: number;
  edgesCreated: number;
  edgesUpdated: number;
  orphanEntitiesSkipped: number;
  errors: { stage: string; message: string }[];
}

const lc = (v: unknown): string => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const confFromUnit = (u: number | null): RainConfidence => (u == null ? "low" : u >= 0.65 ? "high" : u >= 0.35 ? "medium" : "low");
const daysSince = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 86400000));
};
function priceTier(price: unknown): number | null {
  const p = price == null ? null : Number(price);
  if (p == null || Number.isNaN(p) || p <= 0) return null;
  if (p < 1_000_000) return 20;
  if (p < 2_000_000) return 40;
  if (p < 4_000_000) return 60;
  if (p < 8_000_000) return 80;
  return 100;
}
function statusScore(status: unknown): number | null {
  const s = lc(status);
  if (!s) return null;
  if (s.includes("sold") || s.includes("closed")) return 55;
  if (s.includes("publish") || s.includes("active") || s.includes("live")) return 70;
  if (s.includes("contract") || s.includes("pending")) return 60;
  if (s.includes("draft")) return 30;
  if (s.includes("archiv") || s.includes("inactive")) return 20;
  return 45;
}

const REL_TO_EDGE: Record<string, RainEdgeType> = {
  lists: "lists", listed: "lists", sold: "sold", works_with: "works_with",
  markets: "markets", manages: "works_with", represents: "works_with",
};
function relToEdge(rel: string): RainEdgeType {
  return REL_TO_EDGE[lc(rel)] ?? "connected_to";
}

/** Build the RAIN graph for one organization from real internal data. */
export async function buildRainGraph(db: DB, organizationId: string, opts: BuildRainOptions = {}): Promise<BuildRainResult> {
  const res: BuildRainResult = { nodesCreated: 0, nodesUpdated: 0, edgesCreated: 0, edgesUpdated: 0, orphanEntitiesSkipped: 0, errors: [] };
  const cap = {
    agencies: Math.min(opts.maxAgencies ?? 200, 1000),
    properties: Math.min(opts.maxProperties ?? 400, 2000),
    deals: Math.min(opts.maxDeals ?? 200, 1000),
    projects: Math.min(opts.maxProjects ?? 150, 1000),
    signals: Math.min(opts.maxSignals ?? 400, 2000),
  };
  const nodeId = new Map<string, string>(); // `${type}:${entityId}` -> rain node id

  async function ensureNode(input: UpsertNodeInput): Promise<string> {
    const key = `${input.nodeType}:${input.entityId}`;
    const cached = nodeId.get(key);
    if (cached) return cached;
    const { node, created } = await upsertNode(db, organizationId, input);
    if (created) res.nodesCreated++; else res.nodesUpdated++;
    nodeId.set(key, node.id);
    return node.id;
  }
  async function ensureEdge(input: UpsertEdgeInput): Promise<void> {
    const { created } = await upsertEdge(db, organizationId, input);
    if (created) res.edgesCreated++; else res.edgesUpdated++;
  }
  function locEntity(type: "city" | "neighborhood" | "street", city: string | null, neighborhood: string | null, street: string | null): { entityId: string; label: string } | null {
    if (type === "city" && city) return { entityId: `city:${lc(city)}`, label: city };
    if (type === "neighborhood" && neighborhood) return { entityId: `neighborhood:${lc(city)}/${lc(neighborhood)}`, label: neighborhood };
    if (type === "street" && street) return { entityId: `street:${lc(city)}/${lc(neighborhood)}/${lc(street)}`, label: street };
    return null;
  }

  // ── 1) Agencies (+ scores + active-signal counts) → agency nodes ───────────
  const agencyMeta = new Map<string, { city: string | null; name: string }>();
  try {
    const { data: agencies } = await db.from("agencies").select("id,name,display_name,headquarters_city,active")
      .eq("organization_id", organizationId).eq("active", true).order("id").limit(cap.agencies);
    const rows = (agencies as Obj[] | null) ?? [];
    for (const a of rows) {
      const id = a.id as string;
      const { data: score } = await db.from("agency_scores").select("overall,competition_threat,momentum,data_confidence")
        .eq("organization_id", organizationId).eq("agency_id", id).order("calculated_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
      const sc = (score as Obj | null) ?? {};
      const { count: activeSignals } = await db.from("agency_signals").select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId).eq("agency_id", id).eq("status", "active");
      const s = scoreAgencyNode({
        overall: sc.overall == null ? null : Number(sc.overall),
        threat: sc.competition_threat == null ? null : Number(sc.competition_threat),
        momentum: sc.momentum == null ? null : Number(sc.momentum),
        activeSignals: activeSignals ?? 0,
      });
      const city = (a.headquarters_city as string) ?? null;
      const label = (a.display_name as string) || (a.name as string);
      agencyMeta.set(id, { city, name: label });
      await ensureNode({
        nodeType: "agency", entityId: id, label, subtitle: city,
        city, neighborhood: null, street: null, importanceScore: s.importance, confidence: s.confidence,
        metadata: { threat: sc.competition_threat ?? null, overall: sc.overall ?? null, activeSignals: activeSignals ?? 0 },
      });
    }
  } catch (e) { res.errors.push({ stage: "agencies", message: e instanceof Error ? e.message : String(e) }); }

  // ── 2) Agency agents → agent nodes + belongs_to edges ──────────────────────
  try {
    const { data: links } = await db.from("agency_agents").select("agency_id,agent_id,confidence_score,last_verified_at")
      .eq("organization_id", organizationId).not("agent_id", "is", null).order("agency_id").limit(cap.agencies * 5);
    for (const l of ((links as Obj[] | null) ?? [])) {
      const agencyKey = `agency:${l.agency_id as string}`;
      const agencyNode = nodeId.get(agencyKey);
      if (!agencyNode) { res.orphanEntitiesSkipped++; continue; } // agency node must exist
      const agentId = l.agent_id as string;
      // resolve agent label from users (skip if user row doesn't exist)
      const { data: user } = await db.from("users").select("id,full_name").eq("org_id", organizationId).eq("id", agentId).maybeSingle();
      if (!user) { res.orphanEntitiesSkipped++; continue; }
      const relConf = l.confidence_score == null ? null : Number(l.confidence_score);
      const sNode = scoreAgentNode({ relatedProperties: null, agencyRelationConfidence: relConf });
      const agentNode = await ensureNode({
        nodeType: "agent", entityId: agentId, label: ((user as Obj).full_name as string) || "מתווך",
        subtitle: agencyMeta.get(l.agency_id as string)?.name ?? null,
        city: agencyMeta.get(l.agency_id as string)?.city ?? null, neighborhood: null, street: null,
        importanceScore: sNode.importance, confidence: sNode.confidence, metadata: {},
      });
      const sEdge = scoreEdgeStrength({ relationshipConfidence: relConf, recencyDays: daysSince(l.last_verified_at as string) });
      await ensureEdge({
        sourceNodeId: agentNode, targetNodeId: agencyNode, edgeType: "belongs_to",
        strength: sEdge.strength, confidence: sEdge.confidence, evidence: { confidence_score: relConf },
      });
    }
  } catch (e) { res.errors.push({ stage: "agents", message: e instanceof Error ? e.message : String(e) }); }

  // ── 3) Territory stats → territory nodes + dominates edges + competes_with ──
  const territoryAgencies = new Map<string, { agencyNodeId: string; dominance: number | null }[]>();
  try {
    const { data: stats } = await db.from("agency_territory_stats")
      .select("agency_id,territory_type,city,neighborhood,street,dominance_score,momentum_score,confidence")
      .eq("organization_id", organizationId).order("agency_id").limit(cap.agencies * 8);
    for (const t of ((stats as Obj[] | null) ?? [])) {
      const agencyNode = nodeId.get(`agency:${t.agency_id as string}`);
      if (!agencyNode) { res.orphanEntitiesSkipped++; continue; }
      const ttype = lc(t.territory_type) as "city" | "neighborhood" | "street";
      if (ttype !== "city" && ttype !== "neighborhood" && ttype !== "street") continue;
      const loc = locEntity(ttype, (t.city as string) ?? null, (t.neighborhood as string) ?? null, (t.street as string) ?? null);
      if (!loc) continue;
      const dominance = t.dominance_score == null ? null : Number(t.dominance_score);
      const tNode = await ensureNode({
        nodeType: ttype, entityId: loc.entityId, label: loc.label, subtitle: (t.city as string) ?? null,
        city: (t.city as string) ?? null, neighborhood: (t.neighborhood as string) ?? null, street: (t.street as string) ?? null,
        importanceScore: scoreTerritoryNode({ dominanceActivity: dominance }).importance,
        confidence: confFromUnit(t.confidence == null ? null : Number(t.confidence)), metadata: {},
      });
      const sEdge = scoreEdgeStrength({ relationshipConfidence: t.confidence == null ? null : Number(t.confidence), activityVolume: dominance == null ? null : dominance / 10 });
      await ensureEdge({
        sourceNodeId: agencyNode, targetNodeId: tNode, edgeType: "dominates",
        strength: dominance != null ? clamp100(dominance) : sEdge.strength,
        confidence: confFromUnit(t.confidence == null ? null : Number(t.confidence)),
        evidence: { dominance_score: dominance, momentum_score: t.momentum_score ?? null },
      });
      const list = territoryAgencies.get(tNode) ?? [];
      list.push({ agencyNodeId: agencyNode, dominance });
      territoryAgencies.set(tNode, list);
    }
    // competes_with: agencies dominating the same territory (one directional edge per pair)
    for (const [, agenciesInTerr] of territoryAgencies) {
      for (let i = 0; i < agenciesInTerr.length; i++) {
        for (let j = i + 1; j < agenciesInTerr.length; j++) {
          const a = agenciesInTerr[i], b = agenciesInTerr[j];
          const [src, dst] = a.agencyNodeId < b.agencyNodeId ? [a.agencyNodeId, b.agencyNodeId] : [b.agencyNodeId, a.agencyNodeId];
          const overlap = a.dominance != null && b.dominance != null ? 1 : null;
          const s = scoreEdgeStrength({ territoryOverlap: overlap, supportingEvents: 1 });
          await ensureEdge({ sourceNodeId: src, targetNodeId: dst, edgeType: "competes_with", strength: s.strength, confidence: s.confidence, evidence: { shared_territory: true } });
        }
      }
    }
  } catch (e) { res.errors.push({ stage: "territories", message: e instanceof Error ? e.message : String(e) }); }

  // ── 4) Agency signals → signal nodes + triggered_signal edges ──────────────
  try {
    const { data: signals } = await db.from("agency_signals")
      .select("id,agency_id,signal_type,severity,title,importance,status,city,neighborhood,street,detected_at")
      .eq("organization_id", organizationId).eq("status", "active").order("detected_at", { ascending: false }).limit(cap.signals);
    for (const sg of ((signals as Obj[] | null) ?? [])) {
      const agencyNode = nodeId.get(`agency:${sg.agency_id as string}`);
      if (!agencyNode) { res.orphanEntitiesSkipped++; continue; }
      const sevScore = severityWeight(sg.severity as string);
      const sNode = scoreSignalNode({ severityScore: sevScore, importance: sg.importance == null ? null : Number(sg.importance) });
      const signalNode = await ensureNode({
        nodeType: "signal", entityId: sg.id as string, label: (sg.title as string) || "אות",
        subtitle: (sg.signal_type as string) ?? null, city: (sg.city as string) ?? null,
        neighborhood: (sg.neighborhood as string) ?? null, street: (sg.street as string) ?? null,
        importanceScore: sNode.importance, confidence: sNode.confidence,
        metadata: { severity: sg.severity ?? null, signal_type: sg.signal_type ?? null },
      });
      const sEdge = scoreEdgeStrength({ relationshipConfidence: sevScore == null ? null : sevScore / 100, recencyDays: daysSince(sg.detected_at as string) });
      await ensureEdge({ sourceNodeId: agencyNode, targetNodeId: signalNode, edgeType: "triggered_signal", strength: sEdge.strength, confidence: sEdge.confidence, evidence: { severity: sg.severity ?? null } });
    }
  } catch (e) { res.errors.push({ stage: "signals", message: e instanceof Error ? e.message : String(e) }); }

  // ── 5) Properties → property nodes + located_in city edges ─────────────────
  try {
    const { data: props } = await db.from("properties").select("id,title,status,price,city")
      .eq("org_id", organizationId).order("id").limit(cap.properties);
    for (const p of ((props as Obj[] | null) ?? [])) {
      const sNode = scorePropertyNode({ statusScore: statusScore(p.status), priceTier: priceTier(p.price) });
      const city = (p.city as string) ?? null;
      const propNode = await ensureNode({
        nodeType: "property", entityId: p.id as string, label: (p.title as string) || "נכס",
        subtitle: city, city, neighborhood: null, street: null,
        importanceScore: sNode.importance, confidence: sNode.confidence,
        metadata: { status: p.status ?? null, price: p.price ?? null },
      });
      if (city) {
        const loc = locEntity("city", city, null, null)!;
        const cityNode = await ensureNode({ nodeType: "city", entityId: loc.entityId, label: loc.label, subtitle: null, city, neighborhood: null, street: null, importanceScore: null, confidence: "low", metadata: {} });
        await ensureEdge({ sourceNodeId: propNode, targetNodeId: cityNode, edgeType: "located_in", strength: null, confidence: "high", evidence: { city } });
      }
    }
  } catch (e) { res.errors.push({ stage: "properties", message: e instanceof Error ? e.message : String(e) }); }

  // ── 6) Deals → deal nodes + connected_to property edges ────────────────────
  try {
    const { data: deals } = await db.from("deals").select("id,title,status,stage,value,property_id")
      .eq("org_id", organizationId).order("id").limit(cap.deals);
    for (const d of ((deals as Obj[] | null) ?? [])) {
      const dealNode = await ensureNode({
        nodeType: "deal", entityId: d.id as string, label: (d.title as string) || "עסקה",
        subtitle: (d.stage as string) ?? null, city: null, neighborhood: null, street: null,
        importanceScore: priceTier(d.value), confidence: d.value == null ? "low" : "medium",
        metadata: { status: d.status ?? null, stage: d.stage ?? null, value: d.value ?? null },
      });
      const pid = d.property_id as string | null;
      if (pid) {
        const propNode = nodeId.get(`property:${pid}`);
        if (propNode) {
          const isSold = lc(d.status).includes("won") || lc(d.status).includes("closed") || lc(d.stage).includes("won");
          await ensureEdge({ sourceNodeId: dealNode, targetNodeId: propNode, edgeType: isSold ? "sold" : "connected_to", strength: null, confidence: "high", evidence: { property_id: pid } });
        } else { res.orphanEntitiesSkipped++; }
      }
    }
  } catch (e) { res.errors.push({ stage: "deals", message: e instanceof Error ? e.message : String(e) }); }

  // ── 7) Projects → project + developer nodes + located_in / works_with ──────
  try {
    const { data: projects } = await db.from("projects").select("id,name,developer_name,city,status")
      .eq("org_id", organizationId).order("id").limit(cap.projects);
    for (const pr of ((projects as Obj[] | null) ?? [])) {
      const city = (pr.city as string) ?? null;
      const projNode = await ensureNode({
        nodeType: "project", entityId: pr.id as string, label: (pr.name as string) || "פרויקט",
        subtitle: (pr.developer_name as string) ?? city, city, neighborhood: null, street: null,
        importanceScore: null, confidence: "low", metadata: { status: pr.status ?? null },
      });
      if (city) {
        const loc = locEntity("city", city, null, null)!;
        const cityNode = await ensureNode({ nodeType: "city", entityId: loc.entityId, label: loc.label, subtitle: null, city, neighborhood: null, street: null, importanceScore: null, confidence: "low", metadata: {} });
        await ensureEdge({ sourceNodeId: projNode, targetNodeId: cityNode, edgeType: "located_in", strength: null, confidence: "high", evidence: { city } });
      }
      const devName = (pr.developer_name as string) ?? null;
      if (devName) {
        const devNode = await ensureNode({ nodeType: "developer", entityId: `developer:${lc(devName)}`, label: devName, subtitle: null, city, neighborhood: null, street: null, importanceScore: null, confidence: "low", metadata: {} });
        await ensureEdge({ sourceNodeId: devNode, targetNodeId: projNode, edgeType: "works_with", strength: null, confidence: "medium", evidence: { developer_name: devName } });
      }
    }
  } catch (e) { res.errors.push({ stage: "projects", message: e instanceof Error ? e.message : String(e) }); }

  // ── 8) Knowledge-graph relationships → agency↔property/deal edges ───────────
  try {
    const { data: rels } = await db.from("agency_entity_relationships")
      .select("agency_id,entity_type,entity_id,relationship_type,confidence,last_seen_at,active")
      .eq("organization_id", organizationId).eq("active", true).order("agency_id").limit(cap.agencies * 10);
    for (const r of ((rels as Obj[] | null) ?? [])) {
      const agencyNode = nodeId.get(`agency:${r.agency_id as string}`);
      if (!agencyNode) { res.orphanEntitiesSkipped++; continue; }
      const etype = lc(r.entity_type);
      const targetType: RainNodeType | null = etype === "property" ? "property" : etype === "deal" ? "deal" : etype === "project" ? "project" : null;
      if (!targetType) continue;
      const targetNode = nodeId.get(`${targetType}:${r.entity_id as string}`);
      if (!targetNode) { res.orphanEntitiesSkipped++; continue; } // only link to entities that exist as nodes
      const conf = r.confidence == null ? null : Number(r.confidence);
      const sEdge = scoreEdgeStrength({ relationshipConfidence: conf, recencyDays: daysSince(r.last_seen_at as string) });
      await ensureEdge({
        sourceNodeId: agencyNode, targetNodeId: targetNode, edgeType: relToEdge(r.relationship_type as string),
        strength: sEdge.strength, confidence: sEdge.confidence, evidence: { relationship_type: r.relationship_type, confidence: conf },
      });
    }
  } catch (e) { res.errors.push({ stage: "relationships", message: e instanceof Error ? e.message : String(e) }); }

  return res;
}
