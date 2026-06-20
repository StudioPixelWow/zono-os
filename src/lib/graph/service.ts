/**
 * Knowledge Graph service — server-only. Builds the org-wide relationship graph
 * (nodes + edges) and detects graph opportunities. Full regeneration each run.
 * Reuses existing intelligence data; never changes other engines. Org-scoped.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/types";
import { detectBuyerClusters, detectSellerClusters, NODE_LABELS, REL_LABELS, type BuyerForCluster, type SellerForCluster } from "./engine";

type DB = Database["public"]["Tables"];
export type GraphSignalRow = DB["graph_signals"]["Row"];
const cityNorm = (s: string | null | undefined) => (s ? s.trim().toLowerCase() : "");

async function requireProfile() {
  const { profile } = await getSessionContext();
  if (!profile) throw new Error("not authenticated");
  return profile;
}

export interface GraphSummary { nodes: number; edges: number; signals: number }

export async function generateKnowledgeGraph(): Promise<GraphSummary> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const orgId = profile.org_id;

  const [buyersRes, sellersRes, propsRes, leadsRes, usersRes, brokersRes, compsRes, dealsRes, matchesRes, acqRes, extRes, relsRes, mktRes, agtLocRes] = await Promise.all([
    supabase.from("buyers").select("id,full_name,preferred_areas,budget_max,preferred_types,owner_id"),
    supabase.from("sellers").select("id,full_name,owner_id"),
    supabase.from("properties").select("id,title,city,type,seller_id,assigned_agent_id,price,status").neq("status", "archived"),
    supabase.from("leads").select("id,full_name,owner_id,property_id").in("stage", ["new", "contacted", "qualified", "nurturing"]),
    supabase.from("users").select("id,full_name"),
    supabase.from("broker_profiles").select("id,display_name,primary_city"),
    supabase.from("competitor_profiles").select("id,display_name,dominant_localities"),
    supabase.from("deals").select("id,title,owner_id,status,value,buyer_id,seller_id,property_id"),
    supabase.from("match_intelligence_profiles").select("id,buyer_id,property_id,compatibility_score,match_status"),
    supabase.from("inventory_acquisition_profiles").select("id,external_listing_id,acquisition_score,acquisition_status"),
    supabase.from("external_listings").select("id,title,city,detected_broker_id").eq("status", "active").limit(1000),
    supabase.from("entity_relationships").select("source_entity_type,source_entity_id,target_entity_type,target_entity_id,relationship_type,strength_score,status").limit(4000),
    supabase.from("market_area_snapshots").select("locality_name,date,demand_score,supply_score").order("date", { ascending: false }).limit(500),
    supabase.from("agent_locality_performance").select("user_id,locality,deals_count").order("deals_count", { ascending: false }).limit(500),
  ]);

  const buyers = buyersRes.data ?? [];
  const sellers = sellersRes.data ?? [];
  const props = propsRes.data ?? [];
  const users = usersRes.data ?? [];
  const brokers = brokersRes.data ?? [];
  const comps = compsRes.data ?? [];
  const deals = dealsRes.data ?? [];
  const matches = matchesRes.data ?? [];
  const acqs = acqRes.data ?? [];
  const ext = extRes.data ?? [];
  const userName = new Map(users.map((u) => [u.id, u.full_name]));

  // ── Nodes ──
  const nodes: DB["graph_entities"]["Insert"][] = [];
  const node = (type: string, id: string, title: string, subtitle: string | null, importance = 30) => nodes.push({ organization_id: orgId, entity_type: type, entity_id: id, title, subtitle, importance_score: importance });
  for (const b of buyers) node("buyer", b.id, b.full_name, b.preferred_areas?.[0] ?? null, 40);
  for (const s of sellers) node("seller", s.id, s.full_name, null, 45);
  for (const p of props) node("property", p.id, p.title, p.city, 35);
  for (const l of leads(leadsRes)) node("lead", l.id, l.full_name, null, 25);
  for (const u of users) node("agent", u.id, u.full_name, null, 55);
  for (const bk of brokers) node("broker", bk.id, bk.display_name, bk.primary_city, 40);
  for (const c of comps) node("competitor", c.id, c.display_name, null, 45);
  for (const d of deals) node("deal", d.id, d.title, d.status, 60);
  for (const m of matches) node("match", m.id, "התאמה", null, 40);
  for (const a of acqs) node("acquisition", a.id, "הזדמנות גיוס", null, 50);
  const localitySet = new Set<string>();
  for (const p of props) if (p.city) localitySet.add(p.city);
  for (const e of ext) if (e.city) localitySet.add(e.city);
  for (const loc of localitySet) node("locality", cityNorm(loc), loc, null, 50);

  // ── Edges ──
  const edges: DB["graph_relationships"]["Insert"][] = [];
  const edge = (st: string, sid: string, tt: string, tid: string, rel: string, strength: number, confidence = 80) =>
    edges.push({ organization_id: orgId, source_entity_type: st, source_entity_id: sid, target_entity_type: tt, target_entity_id: tid, relationship_type: rel, strength_score: strength, confidence_score: confidence });

  for (const p of props) {
    if (p.seller_id) edge("seller", p.seller_id, "property", p.id, "owns", 90);
    if (p.assigned_agent_id) edge("agent", p.assigned_agent_id, "property", p.id, "assigned_to", 70);
    if (p.city) edge("property", p.id, "locality", cityNorm(p.city), "located_in", 60);
  }
  for (const l of leads(leadsRes)) { if (l.owner_id) edge("agent", l.owner_id, "lead", l.id, "assigned_to", 55); }
  for (const m of matches) { if (m.buyer_id && m.property_id) edge("buyer", m.buyer_id, "property", m.property_id, "matched_to", Math.max(40, m.compatibility_score ?? 50)); }
  for (const e of ext) { if (e.detected_broker_id) edge("external_listing", e.id, "broker", e.detected_broker_id, "represented_by", 75); }
  for (const d of deals) {
    if (d.buyer_id) edge("deal", d.id, "buyer", d.buyer_id, d.status === "won" ? "closed" : "related_to", d.status === "won" ? 95 : 60);
    if (d.seller_id) edge("deal", d.id, "seller", d.seller_id, d.status === "won" ? "closed" : "related_to", d.status === "won" ? 95 : 60);
    if (d.property_id) edge("deal", d.id, "property", d.property_id, "related_to", 70);
    if (d.owner_id) edge("agent", d.owner_id, "deal", d.id, d.status === "won" ? "closed" : "related_to", 80);
  }
  for (const c of comps) {
    const dom = Array.isArray(c.dominant_localities) ? (c.dominant_localities as { locality: string }[]) : [];
    for (const dl of dom) if (dl.locality) edge("competitor", c.id, "locality", cityNorm(dl.locality), "competes_with", 75);
  }
  // Reuse entity_relationships (buyer→property interactions etc.).
  const REL_MAP: Record<string, string> = { buyer_interested_in_property: "interested_in", buyer_viewed_property: "viewed", buyer_liked_property: "liked", buyer_visited_property: "visited", buyer_rejected_property: "rejected", seller_owns_property: "owns" };
  for (const r of relsRes.data ?? []) {
    if (r.status !== "active") continue;
    const rel = REL_MAP[r.relationship_type] ?? "related_to";
    edge(r.source_entity_type, r.source_entity_id, r.target_entity_type, r.target_entity_id, rel, r.strength_score || 50, 70);
  }

  // ── Signals ──
  const signals: DB["graph_signals"]["Insert"][] = [];
  const buyerClusters = detectBuyerClusters(buyers.map((b): BuyerForCluster => ({ id: b.id, city: b.preferred_areas?.[0] ?? null, budgetMax: b.budget_max, propertyType: (b.preferred_types as string[])?.[0] ?? null })));
  for (const c of buyerClusters.slice(0, 8)) signals.push({ organization_id: orgId, signal_type: "hidden_buyer_cluster", title: `${c.count} קונים — ${c.locality} (${c.band})`, description: "אשכול ביקוש נסתר — אותו אזור ותקציב דומה", confidence_score: 75, impact_score: 70, source_entities: c.entityIds as never, status: "new" });
  const sellerClusters = detectSellerClusters(sellers.map((s): SellerForCluster => ({ id: s.id, city: null })));
  for (const c of sellerClusters.slice(0, 5)) signals.push({ organization_id: orgId, signal_type: "hidden_seller_cluster", title: `${c.count} מוכרים — ${c.locality}`, description: "אשכול מוכרים — הזדמנות גיוס מרוכזת", confidence_score: 65, impact_score: 60, source_entities: c.entityIds as never, status: "new" });
  for (const c of comps) {
    const dom = Array.isArray(c.dominant_localities) ? (c.dominant_localities as { locality: string; share: number }[]) : [];
    for (const dl of dom.slice(0, 2)) signals.push({ organization_id: orgId, signal_type: "broker_dominance", title: `${c.display_name} שולט ב${dl.locality}`, description: `${dl.share}% מהמלאי — רשת השפעה`, confidence_score: 78, impact_score: 65, source_entities: [c.id] as never, status: "new" });
  }
  // Agent specialization (from routing locality perf).
  const specByAgent = new Map<string, { locality: string; deals: number }>();
  for (const a of agtLocRes.data ?? []) { const cur = specByAgent.get(a.user_id); if ((!cur || a.deals_count > cur.deals) && a.deals_count >= 3) specByAgent.set(a.user_id, { locality: a.locality, deals: a.deals_count }); }
  for (const [uid, sp] of specByAgent) signals.push({ organization_id: orgId, signal_type: "agent_specialization", title: `${userName.get(uid) ?? "סוכן"} מתמחה ב${sp.locality}`, description: `${sp.deals} עסקאות באזור — ניש מובהק`, confidence_score: 72, impact_score: 55, source_entities: [uid] as never, status: "new" });
  // Locality opportunity (market demand>supply).
  const seenLoc = new Set<string>();
  for (const m of mktRes.data ?? []) { const k = cityNorm(m.locality_name); if (seenLoc.has(k)) continue; seenLoc.add(k); if (m.demand_score >= 65 && m.supply_score <= 50) signals.push({ organization_id: orgId, signal_type: "locality_opportunity", title: `${m.locality_name} — ביקוש גבוה, היצע נמוך`, description: "אזור עם פוטנציאל גיוס וצמיחת רשת", confidence_score: 70, impact_score: 68, source_entities: [k] as never, status: "new" }); }
  // Deal acceleration (buyer with ≥3 property interactions + an active match).
  const interactionByBuyer = new Map<string, number>();
  for (const r of relsRes.data ?? []) if (r.source_entity_type === "buyer" && (r.relationship_type.includes("viewed") || r.relationship_type.includes("visited") || r.relationship_type.includes("liked"))) interactionByBuyer.set(r.source_entity_id, (interactionByBuyer.get(r.source_entity_id) ?? 0) + 1);
  const matchedBuyers = new Set(matches.filter((m) => m.match_status === "active").map((m) => m.buyer_id));
  for (const [bid, n] of interactionByBuyer) if (n >= 3 && matchedBuyers.has(bid)) { const b = buyers.find((x) => x.id === bid); signals.push({ organization_id: orgId, signal_type: "deal_acceleration", title: `${b?.full_name ?? "קונה"} — מואץ לעבר עסקה`, description: `${n} אינטראקציות עם נכסים + התאמה פעילה`, confidence_score: 76, impact_score: 72, source_entities: [bid] as never, status: "new" }); }

  // Full regeneration.
  await Promise.all([
    supabase.from("graph_relationships").delete().eq("organization_id", orgId),
    supabase.from("graph_entities").delete().eq("organization_id", orgId),
    supabase.from("graph_signals").delete().eq("organization_id", orgId).eq("status", "new"),
  ]);
  // Insert in chunks to stay safe.
  const chunk = <T,>(arr: T[], n: number) => { const out: T[][] = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
  for (const c of chunk(nodes, 500)) if (c.length) await supabase.from("graph_entities").insert(c as never);
  for (const c of chunk(edges, 500)) if (c.length) await supabase.from("graph_relationships").insert(c as never);
  if (signals.length) await supabase.from("graph_signals").insert(signals as never);

  return { nodes: nodes.length, edges: edges.length, signals: signals.length };
}

// helper to keep leads typed without re-querying
function leads(res: { data: { id: string; full_name: string; owner_id: string | null; property_id: string | null }[] | null }) {
  return res.data ?? [];
}

// ── Read models ──────────────────────────────────────────────────────────────
export interface GraphBoard {
  cc: { nodes: number; edges: number; signals: number; buyerClusters: number; sellerClusters: number; localities: number };
  signals: GraphSignalRow[];
  localityDna: { locality: string; properties: number; buyers: number; topAgent: string | null; topBroker: string | null }[];
}

export async function getGraphBoard(): Promise<GraphBoard> {
  const supabase = await createClient();
  const [nodesCnt, edgesCnt, signalsRes, locNodesRes] = await Promise.all([
    supabase.from("graph_entities").select("entity_type", { count: "exact", head: false }).limit(5000),
    supabase.from("graph_relationships").select("id", { count: "exact", head: true }),
    supabase.from("graph_signals").select("*").eq("status", "new").order("impact_score", { ascending: false }).limit(80),
    supabase.from("graph_entities").select("entity_type,entity_id,title").eq("entity_type", "locality").limit(200),
  ]);
  const typeCounts = new Map<string, number>();
  for (const n of nodesCnt.data ?? []) typeCounts.set(n.entity_type, (typeCounts.get(n.entity_type) ?? 0) + 1);
  const signals = signalsRes.data ?? [];

  // Locality DNA — counts + leaders from edges.
  const localityNames = new Map((locNodesRes.data ?? []).map((l) => [l.entity_id, l.title]));
  const locDna: GraphBoard["localityDna"] = [];
  if (localityNames.size) {
    const locIds = [...localityNames.keys()];
    const { data: locatedIn } = await supabase.from("graph_relationships").select("source_entity_id,target_entity_id").eq("relationship_type", "located_in").in("target_entity_id", locIds).limit(4000);
    const { data: competes } = await supabase.from("graph_relationships").select("source_entity_id,target_entity_id").eq("relationship_type", "competes_with").in("target_entity_id", locIds).limit(2000);
    const propsByLoc = new Map<string, number>();
    for (const r of locatedIn ?? []) propsByLoc.set(r.target_entity_id, (propsByLoc.get(r.target_entity_id) ?? 0) + 1);
    const brokerByLoc = new Map<string, string>();
    if ((competes ?? []).length) {
      const compIds = [...new Set((competes ?? []).map((r) => r.source_entity_id))];
      const { data: compNodes } = await supabase.from("graph_entities").select("entity_id,title").eq("entity_type", "competitor").in("entity_id", compIds);
      const compName = new Map((compNodes ?? []).map((c) => [c.entity_id, c.title]));
      for (const r of competes ?? []) if (!brokerByLoc.has(r.target_entity_id)) brokerByLoc.set(r.target_entity_id, compName.get(r.source_entity_id) ?? "—");
    }
    for (const [id, title] of localityNames) locDna.push({ locality: title, properties: propsByLoc.get(id) ?? 0, buyers: 0, topAgent: null, topBroker: brokerByLoc.get(id) ?? null });
    locDna.sort((a, b) => b.properties - a.properties);
  }

  return {
    cc: { nodes: (nodesCnt.data ?? []).length, edges: edgesCnt.count ?? 0, signals: signals.length, buyerClusters: signals.filter((s) => s.signal_type === "hidden_buyer_cluster").length, sellerClusters: signals.filter((s) => s.signal_type === "hidden_seller_cluster").length, localities: localityNames.size },
    signals, localityDna: locDna.slice(0, 12),
  };
}

export interface GraphContextItem { type: string; typeLabel: string; id: string; title: string; relationship: string; relLabel: string; strength: number }

/** 1-hop relationship context for any entity (for entity pages). */
export async function getEntityGraphContext(entityType: string, entityId: string): Promise<GraphContextItem[]> {
  const supabase = await createClient();
  const [outRes, inRes] = await Promise.all([
    supabase.from("graph_relationships").select("target_entity_type,target_entity_id,relationship_type,strength_score").eq("source_entity_type", entityType).eq("source_entity_id", entityId).order("strength_score", { ascending: false }).limit(40),
    supabase.from("graph_relationships").select("source_entity_type,source_entity_id,relationship_type,strength_score").eq("target_entity_type", entityType).eq("target_entity_id", entityId).order("strength_score", { ascending: false }).limit(40),
  ]);
  const raw = [
    ...(outRes.data ?? []).map((r) => ({ type: r.target_entity_type, id: r.target_entity_id, rel: r.relationship_type, strength: r.strength_score })),
    ...(inRes.data ?? []).map((r) => ({ type: r.source_entity_type, id: r.source_entity_id, rel: r.relationship_type, strength: r.strength_score })),
  ];
  if (!raw.length) return [];
  // Resolve titles from graph_entities.
  const byType = new Map<string, string[]>();
  for (const r of raw) { const a = byType.get(r.type) ?? []; a.push(r.id); byType.set(r.type, a); }
  const titles = new Map<string, string>();
  for (const [t, ids] of byType) { const { data } = await supabase.from("graph_entities").select("entity_id,title").eq("entity_type", t).in("entity_id", [...new Set(ids)]); for (const n of data ?? []) titles.set(`${t}:${n.entity_id}`, n.title); }
  return raw.map((r) => ({ type: r.type, typeLabel: NODE_LABELS[r.type] ?? r.type, id: r.id, title: titles.get(`${r.type}:${r.id}`) ?? "—", relationship: r.rel, relLabel: REL_LABELS[r.rel] ?? r.rel, strength: r.strength }))
    .sort((a, b) => b.strength - a.strength).slice(0, 24);
}
