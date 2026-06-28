// ============================================================================
// ZONO Brokerage Knowledge — service (server-only).
// The orchestration layer that turns raw brokerage rows into structured,
// explainable knowledge and persists it. Reusable single source of truth:
// future AI agents / BI / automations call these services, never raw tables.
// recomputeBrokerageKnowledge() is the background job; getKnowledgeDashboard()
// composes the read model. Everything deterministic, RLS/audit preserved.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getBrokerageAccess } from "../permissions";
import { scoreAgentDuplicate, type AgentCandidate } from "../identity";
import { normalizeOfficeName, normalizePhoneNumber, sameCity } from "../normalize";
import { compareNames } from "@/lib/broker/engine";
import {
  officeCompleteness, agentCompleteness, buildClusters, estimateMarketShare, summarizeHealth,
  computeCoverage, buildGraph,
  type ClusterItem, type MarketShareInput, type GraphOfficeInput, type GraphAgentInput, type GraphLinkInput,
} from "./index";
import { knowledgeRepository } from "./repository";
import type { BrokerageAccess } from "../types";

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const numv = (v: unknown): number => { const n = typeof v === "string" ? parseFloat(v) : (v as number); return Number.isFinite(n) ? (n as number) : 0; };

export interface KnowledgeRefreshResult {
  offices: number; agents: number; completenessRows: number; clusters: number;
  marketRows: number; coverageCities: number; discoveries: number; healthScore: number; ms: number;
}

interface OfficeRow { id: string; name: string; city: string | null; primary_phone: string | null; primary_email: string | null; website_url: string | null; brand_network: string | null; parent_office_id: string | null; confidence_score: number; owner_name: string | null; registration_number: string | null; last_verified_at: string | null; status: string }
interface AgentRow { id: string; full_name: string; office_id: string | null; city: string | null; primary_phone: string | null; whatsapp_phone: string | null; primary_email: string | null; license_number: string | null; specialties: string[]; confidence_score: number; last_verified_at: string | null; status: string }

/**
 * Background job — recompute the entire knowledge layer (graph, completeness,
 * clusters, market share, health, coverage, discoveries). Each stage is
 * best-effort so one failure never aborts the run. Service-role; bounded caps.
 */
export async function recomputeBrokerageKnowledge(): Promise<KnowledgeRefreshResult> {
  const t0 = Date.now();
  const db = createServiceRoleClient();
  const out: KnowledgeRefreshResult = { offices: 0, agents: 0, completenessRows: 0, clusters: 0, marketRows: 0, coverageCities: 0, discoveries: 0, healthScore: 0, ms: 0 };

  const { data: offData } = await db.from("brokerage_offices" as never)
    .select("id,name,city,primary_phone,primary_email,website_url,brand_network,parent_office_id,confidence_score,owner_name,registration_number,last_verified_at,status").limit(3000);
  const offices = (offData ?? []) as unknown as OfficeRow[];
  const { data: agData } = await db.from("brokerage_agents" as never)
    .select("id,full_name,office_id,city,primary_phone,whatsapp_phone,primary_email,license_number,specialties,confidence_score,last_verified_at,status").limit(8000);
  const agents = (agData ?? []) as unknown as AgentRow[];
  const { data: cpData } = await db.from("brokerage_contact_points" as never).select("entity_type,entity_id,contact_type,value,source_id").limit(30000);
  const contacts = (cpData ?? []) as Row[];
  const { data: linkData } = await db.from("brokerage_external_listing_links" as never).select("external_listing_id,agent_id,office_id,city,created_at").limit(20000);
  const links = (linkData ?? []) as Row[];
  out.offices = offices.length; out.agents = agents.length;

  // Per-entity aggregates (contact-derived presence + source counts).
  const officeContacts = new Map<string, Set<string>>(); // office id → contact types present
  const officeSources = new Map<string, Set<string>>();
  const agentContacts = new Map<string, Set<string>>();
  const agentSources = new Map<string, Set<string>>();
  for (const c of contacts) {
    const eid = String(c.entity_id), t = String(c.contact_type ?? "").toLowerCase();
    const sid = str(c.source_id) ?? "";
    if (c.entity_type === "office") { (officeContacts.get(eid) ?? officeContacts.set(eid, new Set()).get(eid)!).add(t); if (sid) (officeSources.get(eid) ?? officeSources.set(eid, new Set()).get(eid)!).add(sid); }
    else { (agentContacts.get(eid) ?? agentContacts.set(eid, new Set()).get(eid)!).add(t); if (sid) (agentSources.get(eid) ?? agentSources.set(eid, new Set()).get(eid)!).add(sid); }
  }
  // Listing aggregates per office (market share + activity).
  const officeListings = new Map<string, { count: number; cities: Set<string>; recent: number }>();
  const since = Date.now() - 30 * 86_400_000;
  for (const l of links) {
    const oid = str(l.office_id); if (!oid) continue;
    const agg = officeListings.get(oid) ?? officeListings.set(oid, { count: 0, cities: new Set(), recent: 0 }).get(oid)!;
    agg.count++; if (l.city) agg.cities.add(String(l.city));
    if (typeof l.created_at === "string" && new Date(l.created_at).getTime() >= since) agg.recent++;
  }

  // ── Completeness ──────────────────────────────────────────────────────────
  try {
    const rows: Row[] = [];
    for (const o of offices) {
      const ct = officeContacts.get(o.id) ?? new Set();
      const srcCount = (officeSources.get(o.id)?.size ?? 0) + (o.primary_phone ? 1 : 0);
      const present = {
        name: !!o.name, owner: !!o.owner_name, phone: !!o.primary_phone, email: !!o.primary_email, website: !!o.website_url,
        address: ct.has("website") || !!o.website_url, city: !!o.city, google: ct.has("website"),
        facebook: ct.has("facebook"), instagram: ct.has("instagram"), linkedin: ct.has("linkedin"),
        business_hours: false, location: false, coverage_area: false, license: !!o.registration_number,
        sources: srcCount > 0, confidence: numv(o.confidence_score) > 0, last_verification: !!o.last_verified_at,
      };
      const r = officeCompleteness(present);
      rows.push({ entity_type: "office", entity_id: o.id, city: o.city, completeness_pct: r.pct, filled_weight: r.filledWeight, total_weight: r.totalWeight, missing_fields: r.missing as never, suggestions: r.suggestions as never, sources_count: srcCount, computed_at: new Date().toISOString() });
    }
    for (const a of agents) {
      const ct = agentContacts.get(a.id) ?? new Set();
      const srcCount = (agentSources.get(a.id)?.size ?? 0) + (a.primary_phone ? 1 : 0);
      const present = {
        name: !!a.full_name, phone: !!a.primary_phone, email: !!a.primary_email, whatsapp: !!a.whatsapp_phone,
        office: !!a.office_id, city: !!a.city, role: false, specialties: (a.specialties?.length ?? 0) > 0,
        license: !!a.license_number, coverage_area: ct.size > 0, sources: srcCount > 0, confidence: numv(a.confidence_score) > 0, last_verification: !!a.last_verified_at,
      };
      const r = agentCompleteness(present);
      rows.push({ entity_type: "agent", entity_id: a.id, city: a.city, completeness_pct: r.pct, filled_weight: r.filledWeight, total_weight: r.totalWeight, missing_fields: r.missing as never, suggestions: r.suggestions as never, sources_count: srcCount, computed_at: new Date().toISOString() });
    }
    for (let i = 0; i < rows.length; i += 500) await db.from("brokerage_completeness" as never).upsert(rows.slice(i, i + 500) as never, { onConflict: "entity_type,entity_id" });
    out.completenessRows = rows.length;
  } catch (e) { console.error("[knowledge] completeness failed:", e); }

  // ── Knowledge graph ───────────────────────────────────────────────────────
  try {
    const gOffices: GraphOfficeInput[] = offices.map((o) => ({ id: o.id, name: o.name, city: o.city, primaryPhone: o.primary_phone, primaryEmail: o.primary_email, websiteUrl: o.website_url, brandNetwork: o.brand_network, parentOfficeId: o.parent_office_id }));
    const gAgents: GraphAgentInput[] = agents.map((a) => ({ id: a.id, fullName: a.full_name, officeId: a.office_id, city: a.city, primaryPhone: a.primary_phone, whatsappPhone: a.whatsapp_phone, primaryEmail: a.primary_email }));
    const gLinks: GraphLinkInput[] = links.map((l) => ({ externalListingId: String(l.external_listing_id), agentId: str(l.agent_id), officeId: str(l.office_id), city: str(l.city) }));
    const gContacts = contacts.map((c) => ({ entityType: c.entity_type as "office" | "agent", entityId: String(c.entity_id), contactType: String(c.contact_type ?? ""), value: String(c.value ?? "") }));
    const graph = buildGraph({ offices: gOffices, agents: gAgents, links: gLinks, contacts: gContacts });

    const nodeRows = graph.nodes.map((n) => ({ node_key: n.nodeKey, node_type: n.nodeType, label: n.label, entity_id: n.entityId ?? null, value: n.value ?? null, city: n.city ?? null, updated_at: new Date().toISOString() }));
    for (let i = 0; i < nodeRows.length; i += 500) await db.from("brokerage_graph_nodes" as never).upsert(nodeRows.slice(i, i + 500) as never, { onConflict: "node_key" });
    // Map node_key → id for edge persistence.
    const { data: idRows } = await db.from("brokerage_graph_nodes" as never).select("id,node_key").limit(50000);
    const idByKey = new Map<string, string>();
    for (const r of (idRows ?? []) as Row[]) idByKey.set(String(r.node_key), String(r.id));
    const edgeRows = graph.edges.map((e) => ({ src_node_id: idByKey.get(e.srcKey), dst_node_id: idByKey.get(e.dstKey), edge_type: e.edgeType, weight: e.weight ?? 1, confidence: e.confidence ?? 0 }))
      .filter((e) => e.src_node_id && e.dst_node_id);
    for (let i = 0; i < edgeRows.length; i += 500) await db.from("brokerage_graph_edges" as never).upsert(edgeRows.slice(i, i + 500) as never, { onConflict: "src_node_id,dst_node_id,edge_type" });
  } catch (e) { console.error("[knowledge] graph failed:", e); }

  // ── Duplicate clusters (per city, offices + agents) ───────────────────────
  try {
    await db.from("brokerage_duplicate_clusters" as never).delete().eq("status", "open");
    const officeById = new Map(offices.map((o) => [o.id, o]));
    const agentById = new Map(agents.map((a) => [a.id, a]));
    const officeScore = (a: ClusterItem, b: ClusterItem) => {
      const oa = officeById.get(a.id)!, ob = officeById.get(b.id)!;
      const reasons: string[] = []; let sc = 0;
      const pa = normalizePhoneNumber(oa.primary_phone), pb = normalizePhoneNumber(ob.primary_phone);
      const phoneHit = !!pa && pa === pb; if (phoneHit) { sc += 70; reasons.push("טלפון זהה"); }
      const ns = compareNames(normalizeOfficeName(oa.name), normalizeOfficeName(ob.name));
      if (ns >= 0.99) { sc += phoneHit ? 25 : 55; reasons.push("שם זהה"); } else if (ns >= 0.6) { sc += phoneHit ? 15 : 30; reasons.push("שם דומה"); }
      if (sameCity(oa.city, ob.city)) { sc += 5; reasons.push("אותה עיר"); }
      if (!phoneHit && ns < 0.6) sc = Math.min(sc, 40);
      return { score: Math.min(100, Math.round(sc)), reasons };
    };
    const persistClusters = async (entityType: "office" | "agent", clusters: ReturnType<typeof buildClusters>) => {
      for (const c of clusters) {
        const { data: ins } = await db.from("brokerage_duplicate_clusters" as never)
          .insert({ entity_type: entityType, city: c.city, cluster_confidence: c.confidence, master_entity_id: c.masterId, member_count: c.members.length, recommendation: c.recommendation, ai_explanation: c.explanation, status: "open" } as never)
          .select("id").maybeSingle();
        const cid = (ins as { id?: string } | null)?.id; if (!cid) continue;
        await db.from("brokerage_duplicate_cluster_members" as never).insert(c.members.map((m) => ({ cluster_id: cid, entity_id: m.id, similarity: m.similarity, is_master: m.isMaster, reasons: m.reasons as never })) as never);
        out.clusters++;
      }
    };
    // group by city to bound O(n²)
    const byCityOffices = new Map<string, OfficeRow[]>();
    for (const o of offices) { const k = o.city ?? "—"; (byCityOffices.get(k) ?? byCityOffices.set(k, []).get(k)!).push(o); }
    for (const list of byCityOffices.values()) {
      if (list.length < 2 || list.length > 400) continue;
      const items: ClusterItem[] = list.map((o) => ({ id: o.id, label: o.name, masterScore: numv(o.confidence_score) + (o.primary_phone ? 10 : 0), city: o.city }));
      await persistClusters("office", buildClusters("office", items, officeScore, 75));
    }
    const byCityAgents = new Map<string, AgentRow[]>();
    for (const a of agents) { const k = a.city ?? "—"; (byCityAgents.get(k) ?? byCityAgents.set(k, []).get(k)!).push(a); }
    const agentScore = (a: ClusterItem, b: ClusterItem) => {
      const aa = agentById.get(a.id)!, bb = agentById.get(b.id)!;
      const ca: AgentCandidate = { id: aa.id, fullName: aa.full_name, primaryPhone: aa.primary_phone, whatsappPhone: aa.whatsapp_phone, city: aa.city };
      const cb: AgentCandidate = { id: bb.id, fullName: bb.full_name, primaryPhone: bb.primary_phone, whatsappPhone: bb.whatsapp_phone, city: bb.city };
      const score = scoreAgentDuplicate(ca, cb);
      const reasons = score >= 70 ? ["טלפון/שם תואמים"] : [];
      return { score, reasons };
    };
    for (const list of byCityAgents.values()) {
      if (list.length < 2 || list.length > 600) continue;
      const items: ClusterItem[] = list.map((a) => ({ id: a.id, label: a.full_name, masterScore: numv(a.confidence_score) + (a.primary_phone ? 10 : 0), city: a.city }));
      await persistClusters("agent", buildClusters("agent", items, agentScore, 75));
    }
  } catch (e) { console.error("[knowledge] clusters failed:", e); }

  // ── Market share ──────────────────────────────────────────────────────────
  try {
    const inputs: MarketShareInput[] = offices.map((o) => {
      const agg = officeListings.get(o.id);
      return { id: o.id, label: o.name, network: o.brand_network, city: o.city, listings: agg?.count ?? 0, cities: agg?.cities.size ?? (o.city ? 1 : 0), neighborhoods: 0, sources: officeSources.get(o.id)?.size ?? 0, recentListings: agg?.recent ?? 0 };
    });
    const rows = estimateMarketShare(inputs).map((r) => ({ scope_type: r.scopeType, scope_key: r.scopeKey, scope_label: r.scopeLabel, city: r.city, listings_count: r.listings, activity_score: r.activity, cities_count: r.cities, neighborhoods_count: r.neighborhoods, growth_score: r.growth, visibility_score: r.visibility, sources_count: r.sources, market_share_pct: r.sharePct, rank: r.rank, computed_at: new Date().toISOString() }));
    await db.from("brokerage_market_share" as never).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    for (let i = 0; i < rows.length; i += 500) await db.from("brokerage_market_share" as never).insert(rows.slice(i, i + 500) as never);
    out.marketRows = rows.length;
  } catch (e) { console.error("[knowledge] market share failed:", e); }

  // ── Coverage (per city) ───────────────────────────────────────────────────
  const cityKnown = new Map<string, { offices: number; agents: number }>();
  for (const o of offices) { if (!o.city) continue; const c = cityKnown.get(o.city) ?? cityKnown.set(o.city, { offices: 0, agents: 0 }).get(o.city)!; c.offices++; }
  for (const a of agents) { if (!a.city) continue; const c = cityKnown.get(a.city) ?? cityKnown.set(a.city, { offices: 0, agents: 0 }).get(a.city)!; c.agents++; }
  try {
    const rows = [...cityKnown.entries()].map(([city, k]) => { const cov = computeCoverage({ city, knownOffices: k.offices, knownAgents: k.agents }); return { city: cov.city, estimated_offices: cov.estimatedOffices, known_offices: cov.knownOffices, coverage_pct: cov.coveragePct, known_agents: cov.knownAgents, missing_offices: cov.missingOffices, missing_agents: cov.missingAgents, confidence: cov.confidence, computed_at: new Date().toISOString() }; });
    for (let i = 0; i < rows.length; i += 500) await db.from("brokerage_coverage" as never).upsert(rows.slice(i, i + 500) as never, { onConflict: "city" });
    out.coverageCities = rows.length;
  } catch (e) { console.error("[knowledge] coverage failed:", e); }

  // ── Relationship discovery (deterministic) ────────────────────────────────
  try {
    await db.from("brokerage_relationship_discoveries" as never).delete().eq("status", "pending");
    const discoveries: Row[] = [];
    // shared_office: agents sharing the same phone but different office.
    const phoneToAgents = new Map<string, AgentRow[]>();
    for (const a of agents) { const p = normalizePhoneNumber(a.primary_phone); if (!p) continue; (phoneToAgents.get(p) ?? phoneToAgents.set(p, []).get(p)!).push(a); }
    for (const list of phoneToAgents.values()) {
      if (list.length < 2) continue;
      const offices_ = new Set(list.map((a) => a.office_id).filter(Boolean));
      if (offices_.size > 1) discoveries.push({ discovery_type: "shared_office", entity_a_type: "agent", entity_a_id: list[0].id, entity_b_type: "agent", entity_b_id: list[1].id, city: list[0].city, confidence: 72, reasons: ["טלפון משותף בין סוכנים במשרדים שונים"] as never, ai_explanation: "ייתכן שיתוף משרד או שינוי שיוך", status: "pending" });
    }
    // new_branch: same network across multiple cities.
    const netCities = new Map<string, Set<string>>();
    for (const o of offices) { const n = (o.brand_network ?? "").trim(); if (!n || !o.city) continue; (netCities.get(n) ?? netCities.set(n, new Set()).get(n)!).add(o.city); }
    for (const [net, cities] of netCities) { if (cities.size >= 3) discoveries.push({ discovery_type: "new_branch", entity_a_type: "office", entity_a_id: null, entity_b_type: null, entity_b_id: null, city: [...cities][0], confidence: 65, reasons: [`רשת ${net} פעילה ב-${cities.size} ערים`] as never, ai_explanation: "רשת מסועפת — בדוק סניפים חסרים", status: "pending" }); }
    for (let i = 0; i < discoveries.length; i += 500) await db.from("brokerage_relationship_discoveries" as never).insert(discoveries.slice(i, i + 500) as never);
    out.discoveries = discoveries.length;
  } catch (e) { console.error("[knowledge] discovery failed:", e); }

  // ── Data health snapshot ──────────────────────────────────────────────────
  try {
    const missingPhones = offices.filter((o) => !o.primary_phone).length + agents.filter((a) => !a.primary_phone).length;
    const missingEmails = offices.filter((o) => !o.primary_email).length + agents.filter((a) => !a.primary_email).length;
    const lowConfidence = offices.filter((o) => numv(o.confidence_score) < 50).length + agents.filter((a) => numv(a.confidence_score) < 50).length;
    const needsReview = offices.filter((o) => o.status === "candidate" || o.status === "conflict").length + agents.filter((a) => a.status === "candidate" || a.status === "conflict").length;
    const inactiveOffices = offices.filter((o) => o.status === "inactive" || o.status === "not_found_recently").length;
    const coverageVals = [...cityKnown.entries()].map(([city, k]) => computeCoverage({ city, knownOffices: k.offices, knownAgents: k.agents }).coveragePct);
    const coveragePct = coverageVals.length ? Math.round(coverageVals.reduce((a, b) => a + b, 0) / coverageVals.length) : 0;
    const verifiedTimes = [...offices, ...agents].map((x) => x.last_verified_at).filter(Boolean).map((d) => new Date(d as string).getTime());
    const freshnessHours = verifiedTimes.length ? Math.round((Date.now() - Math.max(...verifiedTimes)) / 3_600_000) : null;
    const health = summarizeHealth({ totalOffices: offices.length, totalAgents: agents.length, missingPhones, missingEmails, lowConfidence, duplicateClusters: out.clusters, inactiveOffices, needsReview, coveragePct, freshnessHours });
    out.healthScore = health.healthScore;
    await db.from("brokerage_data_health_snapshots" as never).insert({ scope: "global", healthy: health.healthy, needs_review: needsReview, missing_phones: missingPhones, missing_emails: missingEmails, low_confidence: lowConfidence, duplicate_clusters: out.clusters, inactive_offices: inactiveOffices, coverage_pct: coveragePct, freshness_hours: freshnessHours, metrics: { healthScore: health.healthScore } as never } as never);
  } catch (e) { console.error("[knowledge] health failed:", e); }

  // Audit: record a refresh run for this knowledge recompute.
  try {
    await db.from("brokerage_refresh_runs" as never).insert({ run_type: "source", status: "completed", parameters: { mode: "knowledge_recompute" } as never, started_at: new Date(t0).toISOString(), finished_at: new Date().toISOString(), updated_records: out.completenessRows } as never);
  } catch { /* best-effort */ }

  out.ms = Date.now() - t0;
  return out;
}

// ── Dashboard read model (single source of truth for the UI) ────────────────
export interface KnowledgeDashboard {
  access: BrokerageAccess;
  health: Awaited<ReturnType<typeof knowledgeRepository.latestHealth>>;
  completenessLow: Awaited<ReturnType<typeof knowledgeRepository.completeness>>;
  clusters: Awaited<ReturnType<typeof knowledgeRepository.clusters>>;
  marketShare: Awaited<ReturnType<typeof knowledgeRepository.marketShare>>;
  coverage: Awaited<ReturnType<typeof knowledgeRepository.coverage>>;
  discoveries: Awaited<ReturnType<typeof knowledgeRepository.discoveries>>;
}

export async function getKnowledgeDashboard(): Promise<KnowledgeDashboard | null> {
  const access = await getBrokerageAccess();
  if (!access) return null;
  const [health, completenessLow, clusters, marketShare, coverage, discoveries] = await Promise.all([
    access.isOwner ? knowledgeRepository.latestHealth() : Promise.resolve(null),
    knowledgeRepository.completeness({ order: "asc", limit: 40 }),
    knowledgeRepository.clusters(40),
    knowledgeRepository.marketShare(undefined, 40),
    knowledgeRepository.coverage(40),
    knowledgeRepository.discoveries(40),
  ]);
  return { access, health, completenessLow, clusters, marketShare, coverage, discoveries };
}

export { knowledgeRepository };
