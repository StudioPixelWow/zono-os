// ============================================================================
// 🔗 CRM Relationship Graph Integration — service (server-only). 28.4.
// Reads live CRM data (leads / buyers / sellers / properties / buyer-property
// matches / missions / activities), builds the Universal Relationship Graph via
// the existing engine, and exposes the CRM dashboard + a per-entity edge index
// the Buyer/Seller/Lead twins consume. Read-only; evidence-only; no schema
// changes; no engine modified.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getActionCenter } from "@/lib/mission-engine";
import { buildGraph, analyzeNetwork, type NodeSeed, type EntityType } from "@/lib/relationship-graph";
import { relationsFromCrm, type CrmInputs, type LeadRel, type BuyerRel, type SellerRel, type MissionRel, type ActivityRel, type DuplicatePair } from "./discovery";
import { buildCrmDashboard, type CrmDashboard } from "./dashboard";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : null; };
const norm = (v: string | null): string => (v ?? "").trim().toLowerCase().replace(/[^0-9a-z@.]/g, "");

export interface LiteEdge { from: string; to: string; type: string; strength: number }
export interface CrmGraphResult {
  version: string; generatedAt: string;
  dashboard: CrmDashboard;
  edgesByEntity: Map<string, LiteEdge[]>;
  notes: string[];
}

async function gather(orgId: string | null) {
  const db = await createClient();
  const notes: string[] = [];
  const safe = async (t: string, cols: string, cap: number): Promise<Row[]> => {
    try { const { data } = await db.from(t as never).select(cols).limit(cap); return (data ?? []) as Row[]; } catch { return []; }
  };

  const [leadRows, buyerRows, sellerRows, matchRows, propRows] = await Promise.all([
    safe("leads", "id,full_name,converted_buyer_id,converted_seller_id,property_id,owner_id,phone,email,updated_at", 300),
    safe("buyers", "id,full_name,owner_id,updated_at", 300),
    safe("sellers", "id,full_name,owner_id,updated_at", 300),
    safe("buyer_property_matches", "buyer_id,linked_property_id,match_score,updated_at", 2000),
    safe("properties", "id,seller_id", 1000),
  ]);
  if (!leadRows.length && !buyerRows.length && !sellerRows.length) notes.push("אין נתוני CRM עדיין — צור לידים/קונים/מוכרים כדי לבנות קשרים. אין המצאות.");

  // Activities (bulk, best-effort).
  const activities: ActivityRel[] = [];
  const perEntityActs = new Map<string, number>();
  for (const a of await safe("activities", "id,buyer_id,seller_id,lead_id,kind,occurred_at", 2000)) {
    const eid = s(a.buyer_id) ?? s(a.seller_id) ?? s(a.lead_id); if (!eid) continue;
    const et: EntityType = s(a.buyer_id) ? "buyer" : s(a.seller_id) ? "seller" : "lead";
    const c = perEntityActs.get(eid) ?? 0; if (c >= 5) continue; perEntityActs.set(eid, c + 1);
    activities.push({ id: String(a.id), entityType: et, entityId: eid, kind: s(a.kind) ?? "other", at: s(a.occurred_at) });
  }

  // Missions (reuse Action Center).
  const missions: MissionRel[] = [];
  try {
    const ac = await getActionCenter(orgId);
    const union = new Map<string, { id: string; entityType: string; entityId: string | null; at: string }>();
    for (const b of [ac.recentlyCreated, ac.critical, ac.highPriority, ac.inProgress, ac.completed]) for (const m of b) if (!union.has(m.id)) union.set(m.id, { id: m.id, entityType: m.entityType, entityId: m.entityId, at: m.createdAt });
    missions.push(...union.values());
    if (ac.notes?.length) notes.push(...ac.notes);
  } catch { /* optional */ }

  return { db, notes, leadRows, buyerRows, sellerRows, matchRows, propRows, activities, missions };
}

/** Build the CRM relationship graph + dashboard + per-entity edge index. */
export async function getCrmGraph(orgId: string | null): Promise<CrmGraphResult> {
  const g = await gather(orgId);

  const sellerByProp = new Map<string, string>();     // property → seller (from properties.seller_id)
  const propBySeller = new Map<string, string>();
  for (const p of g.propRows) { const pid = s(p.id), sid = s(p.seller_id); if (pid && sid) { sellerByProp.set(pid, sid); if (!propBySeller.has(sid)) propBySeller.set(sid, pid); } }

  const matchesByBuyer = new Map<string, { propertyId: string; score: number; at: string | null }[]>();
  for (const m of g.matchRows) { const bid = s(m.buyer_id), pid = s(m.linked_property_id); if (!bid || !pid) continue; (matchesByBuyer.get(bid) ?? matchesByBuyer.set(bid, []).get(bid)!).push({ propertyId: pid, score: num(m.match_score) ?? 0, at: s(m.updated_at) }); }

  const leads: LeadRel[] = g.leadRows.map((r) => ({ id: String(r.id), name: s(r.full_name) ?? "ליד", convertedBuyerId: s(r.converted_buyer_id), convertedSellerId: s(r.converted_seller_id), propertyId: s(r.property_id), ownerId: s(r.owner_id), at: s(r.updated_at) }));
  const buyers: BuyerRel[] = g.buyerRows.map((r) => ({ id: String(r.id), name: s(r.full_name) ?? "קונה", ownerId: s(r.owner_id), matches: matchesByBuyer.get(String(r.id)) ?? [], at: s(r.updated_at) }));
  const sellers: SellerRel[] = g.sellerRows.map((r) => ({ id: String(r.id), name: s(r.full_name) ?? "מוכר", ownerId: s(r.owner_id), propertyId: propBySeller.get(String(r.id)) ?? null, valuationId: null, at: s(r.updated_at) }));

  // Duplicate leads (shared normalized phone/email).
  const contactToLeads = new Map<string, string[]>();
  for (const r of g.leadRows) for (const c of [norm(s(r.phone)), norm(s(r.email))]) if (c) (contactToLeads.get(c) ?? contactToLeads.set(c, []).get(c)!).push(String(r.id));
  const dupSet = new Set<string>(); const duplicates: DuplicatePair[] = [];
  for (const ids of contactToLeads.values()) { if (ids.length < 2) continue; for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const key = ids[i] < ids[j] ? `${ids[i]}|${ids[j]}` : `${ids[j]}|${ids[i]}`; if (dupSet.has(key)) continue; dupSet.add(key); duplicates.push({ a: ids[i], b: ids[j] }); } }

  const inputs: CrmInputs = { leads, buyers, sellers, missions: g.missions, activities: g.activities, duplicates };
  const relations = relationsFromCrm(inputs);

  // Node seeds (names).
  const seeds = new Map<string, NodeSeed>();
  const seed = (id: string, type: EntityType, name: string) => { if (!seeds.has(id)) seeds.set(id, { id, type, name }); };
  for (const l of leads) seed(l.id, "lead", l.name);
  for (const b of buyers) seed(b.id, "buyer", b.name);
  for (const sel of sellers) seed(sel.id, "seller", sel.name);
  for (const p of g.propRows) { const pid = s(p.id); if (pid) seed(pid, "property", `נכס ${pid.slice(0, 8)}`); }
  for (const l of leads) if (l.ownerId) seed(`broker:${l.ownerId}`, "broker", `מתווך ${l.ownerId.slice(0, 8)}`);
  for (const b of buyers) if (b.ownerId) seed(`broker:${b.ownerId}`, "broker", `מתווך ${b.ownerId.slice(0, 8)}`);
  for (const sel of sellers) if (sel.ownerId) seed(`broker:${sel.ownerId}`, "broker", `מתווך ${sel.ownerId.slice(0, 8)}`);
  for (const m of g.missions) seed(m.id, "mission", "משימה");
  for (const a of g.activities) seed(a.id, "activity", `פעילות`);

  const graph = buildGraph([...seeds.values()], relations);
  const network = analyzeNetwork(graph);
  const dashboard = buildCrmDashboard(graph, network);

  const edgesByEntity = new Map<string, LiteEdge[]>();
  for (const e of graph.edges) {
    const lite: LiteEdge = { from: e.from, to: e.to, type: e.type, strength: e.strength };
    (edgesByEntity.get(e.from) ?? edgesByEntity.set(e.from, []).get(e.from)!).push(lite);
    (edgesByEntity.get(e.to) ?? edgesByEntity.set(e.to, []).get(e.to)!).push(lite);
  }

  return { version: "28.4", generatedAt: new Date().toISOString(), dashboard, edgesByEntity, notes: g.notes };
}

/** Per-entity edge index the twins consume (built once, reused across twins). */
export async function getCrmEdgeIndex(orgId: string | null): Promise<Map<string, LiteEdge[]>> {
  try { return (await getCrmGraph(orgId)).edgesByEntity; } catch { return new Map(); }
}
