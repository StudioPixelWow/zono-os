/**
 * Lead Routing Intelligence service — server-only. Builds Agent Intelligence
 * Twins from office activity and routes leads to the best-fit agent. Org-scoped.
 * No auto-contact. Recompute learns continuously from real deals/leads/activity.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { logActivityEvent } from "@/lib/activity/service";
import type { Database } from "@/lib/supabase/types";
import {
  calculateAgentScore, deriveStrengths, rankAgentsForLead, routingConfidence,
  type AgentForRouting, type AgentScores, type AgentTwinInput, type LeadContext,
} from "./engine";

type DB = Database["public"]["Tables"];
export type AgentTwinRow = DB["agent_intelligence_profiles"]["Row"];
const DAY = 86_400_000;
const cityNorm = (s: string | null | undefined) => (s ? s.trim().toLowerCase() : "");
const ACTIVE_LEAD_STAGES = new Set(["new", "contacted", "qualified", "nurturing"]);

async function requireProfile() {
  const { profile } = await getSessionContext();
  if (!profile) throw new Error("not authenticated");
  return profile;
}

export interface TwinRecomputeSummary { agents: number }

export async function recomputeAgentTwinsForOrg(): Promise<TwinRecomputeSummary> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const orgId = profile.org_id;
  const since90 = new Date(Date.now() - 90 * DAY).toISOString();

  const [usersRes, leadsRes, dealsRes, propsRes, buyersRes, sellersRes, tasksRes] = await Promise.all([
    supabase.from("users").select("id,full_name"),
    supabase.from("leads").select("owner_id,stage,property_id,intent"),
    supabase.from("deals").select("owner_id,status,value,commission_amount,property_id,closed_at,created_at,type"),
    supabase.from("properties").select("id,city,type,assigned_agent_id"),
    supabase.from("buyers").select("owner_id"),
    supabase.from("sellers").select("owner_id"),
    supabase.from("tasks").select("assignee_id,status"),
  ]);

  const users = usersRes.data ?? [];
  if (!users.length) return { agents: 0 };
  const propMap = new Map((propsRes.data ?? []).map((p) => [p.id, { city: p.city, type: p.type }]));

  interface Agg {
    activeLeads: number; totalLeads: number; closed: number; lost: number; revenue: number;
    daysSum: number; daysN: number; recent90: number; activeProperties: number; activeBuyers: number;
    activeSellers: number; activeTasks: number;
    localities: Map<string, { leads: number; deals: number; revenue: number; daysSum: number; daysN: number }>;
    propTypes: Map<string, { leads: number; deals: number; revenue: number; daysSum: number; daysN: number }>;
  }
  const agg = new Map<string, Agg>();
  const blank = (): Agg => ({ activeLeads: 0, totalLeads: 0, closed: 0, lost: 0, revenue: 0, daysSum: 0, daysN: 0, recent90: 0, activeProperties: 0, activeBuyers: 0, activeSellers: 0, activeTasks: 0, localities: new Map(), propTypes: new Map() });
  for (const u of users) agg.set(u.id, blank());

  for (const l of leadsRes.data ?? []) {
    if (!l.owner_id) continue; const a = agg.get(l.owner_id); if (!a) continue;
    a.totalLeads++;
    if (ACTIVE_LEAD_STAGES.has(l.stage)) a.activeLeads++;
    const p = l.property_id ? propMap.get(l.property_id) : null;
    if (p?.city) { const c = cityNorm(p.city); const loc = a.localities.get(c) ?? { leads: 0, deals: 0, revenue: 0, daysSum: 0, daysN: 0 }; loc.leads++; a.localities.set(c, loc); }
    if (p?.type) { const pt = a.propTypes.get(p.type) ?? { leads: 0, deals: 0, revenue: 0, daysSum: 0, daysN: 0 }; pt.leads++; a.propTypes.set(p.type, pt); }
  }
  for (const d of dealsRes.data ?? []) {
    if (!d.owner_id) continue; const a = agg.get(d.owner_id); if (!a) continue;
    const rev = d.commission_amount ?? Math.round((d.value ?? 0) * 0.02);
    const p = d.property_id ? propMap.get(d.property_id) : null;
    if (d.status === "won") {
      a.closed++; a.revenue += rev;
      if (d.closed_at && d.created_at) { const days = Math.max(0, Math.floor((new Date(d.closed_at).getTime() - new Date(d.created_at).getTime()) / DAY)); a.daysSum += days; a.daysN++; }
      if (d.closed_at && d.closed_at >= since90) a.recent90++;
      if (p?.city) { const c = cityNorm(p.city); const loc = a.localities.get(c) ?? { leads: 0, deals: 0, revenue: 0, daysSum: 0, daysN: 0 }; loc.deals++; loc.revenue += rev; a.localities.set(c, loc); }
      if (p?.type) { const pt = a.propTypes.get(p.type) ?? { leads: 0, deals: 0, revenue: 0, daysSum: 0, daysN: 0 }; pt.deals++; pt.revenue += rev; a.propTypes.set(p.type, pt); }
    } else if (d.status === "lost") a.lost++;
  }
  for (const p of propsRes.data ?? []) { if (p.assigned_agent_id) { const a = agg.get(p.assigned_agent_id); if (a) a.activeProperties++; } }
  for (const b of buyersRes.data ?? []) { if (b.owner_id) { const a = agg.get(b.owner_id); if (a) a.activeBuyers++; } }
  for (const s of sellersRes.data ?? []) { if (s.owner_id) { const a = agg.get(s.owner_id); if (a) a.activeSellers++; } }
  for (const t of tasksRes.data ?? []) { if (t.assignee_id && t.status !== "done") { const a = agg.get(t.assignee_id); if (a) a.activeTasks++; } }

  const profileRows: DB["agent_intelligence_profiles"]["Insert"][] = [];
  const locRows: DB["agent_locality_performance"]["Insert"][] = [];
  const ptRows: DB["agent_property_type_performance"]["Insert"][] = [];

  for (const u of users) {
    const a = agg.get(u.id)!;
    const maxLocalityDeals = Math.max(0, ...[...a.localities.values()].map((l) => l.deals));
    const input: AgentTwinInput = {
      activeLeads: a.activeLeads, activeBuyers: a.activeBuyers, activeSellers: a.activeSellers,
      activeProperties: a.activeProperties, activeMatches: 0, closedDeals: a.closed, lostDeals: a.lost,
      totalLeadsHandled: a.totalLeads, totalRevenue: a.revenue, avgDaysToClose: a.daysN ? Math.round(a.daysSum / a.daysN) : null,
      recentDeals90d: a.recent90, localitiesCovered: a.localities.size, propertyTypesCovered: a.propTypes.size,
      maxLocalityDeals, avgResponseMinutes: null,
    };
    const scores = calculateAgentScore(input);
    const sw = deriveStrengths(scores);
    const topLoc = [...a.localities.entries()].sort((x, y) => y[1].deals - x[1].deals).slice(0, 3).map(([c, v]) => ({ locality: c, deals: v.deals }));
    const topPt = [...a.propTypes.entries()].sort((x, y) => y[1].deals - x[1].deals).slice(0, 3).map(([t, v]) => ({ type: t, deals: v.deals }));
    profileRows.push({
      organization_id: orgId, user_id: u.id,
      agent_score: scores.agent_score, territory_score: scores.territory_score, conversion_score: scores.conversion_score,
      responsiveness_score: scores.responsiveness_score, expertise_score: scores.expertise_score, customer_score: scores.customer_score,
      workload_score: scores.workload_score, momentum_score: scores.momentum_score, satisfaction_score: scores.satisfaction_score, reliability_score: scores.reliability_score,
      active_leads: a.activeLeads, active_buyers: a.activeBuyers, active_sellers: a.activeSellers, active_properties: a.activeProperties, active_matches: 0,
      total_closed_deals: a.closed, total_revenue: a.revenue, avg_response_minutes: null, avg_days_to_close: input.avgDaysToClose,
      primary_localities: topLoc as never, primary_property_types: topPt as never, primary_deal_types: [] as never,
      strengths: sw.strengths as never, weaknesses: sw.weaknesses as never, next_best_growth_area: sw.growth,
      ai_summary: `${u.full_name}: ${a.closed} עסקאות, המרה ${scores.conversion_score}, עומס ${100 - scores.workload_score}. חזק ב: ${sw.strengths.join(", ")}.`,
      ai_growth_advice: `מומלץ: ${sw.growth}.`, last_calculated_at: new Date().toISOString(),
    });
    for (const [c, v] of a.localities) locRows.push({ organization_id: orgId, user_id: u.id, locality: c, leads_count: v.leads, meetings_count: 0, deals_count: v.deals, revenue: v.revenue, avg_days_to_close: v.daysN ? Math.round(v.daysSum / v.daysN) : null, conversion_rate: v.leads ? Math.round((v.deals / v.leads) * 10000) / 100 : 0, satisfaction_rate: 0 });
    for (const [t, v] of a.propTypes) ptRows.push({ organization_id: orgId, user_id: u.id, property_type: t, leads_count: v.leads, deals_count: v.deals, conversion_rate: v.leads ? Math.round((v.deals / v.leads) * 10000) / 100 : 0, avg_days_to_close: v.daysN ? Math.round(v.daysSum / v.daysN) : null, revenue: v.revenue });
  }

  await supabase.from("agent_intelligence_profiles").upsert(profileRows as never, { onConflict: "organization_id,user_id" });
  await supabase.from("agent_locality_performance").delete().eq("organization_id", orgId);
  await supabase.from("agent_property_type_performance").delete().eq("organization_id", orgId);
  if (locRows.length) await supabase.from("agent_locality_performance").insert(locRows as never);
  if (ptRows.length) await supabase.from("agent_property_type_performance").insert(ptRows as never);
  return { agents: profileRows.length };
}

// ── Lead routing ─────────────────────────────────────────────────────────────
async function loadAgentsForRouting(supabase: Awaited<ReturnType<typeof createClient>>): Promise<{ agents: AgentForRouting[]; byUser: Map<string, AgentForRouting> }> {
  const [twinsRes, locRes, ptRes] = await Promise.all([
    supabase.from("agent_intelligence_profiles").select("*"),
    supabase.from("agent_locality_performance").select("user_id,locality,deals_count,conversion_rate"),
    supabase.from("agent_property_type_performance").select("user_id,property_type,deals_count,conversion_rate"),
  ]);
  const twins = twinsRes.data ?? [];
  const userIds = twins.map((t) => t.user_id);
  const names = new Map<string, string>();
  if (userIds.length) { const { data } = await supabase.from("users").select("id,full_name").in("id", userIds); for (const u of data ?? []) names.set(u.id, u.full_name); }
  const locByUser = new Map<string, Map<string, { deals: number; conv: number }>>();
  for (const l of locRes.data ?? []) { const m = locByUser.get(l.user_id) ?? new Map(); m.set(l.locality, { deals: l.deals_count, conv: l.conversion_rate }); locByUser.set(l.user_id, m); }
  const ptByUser = new Map<string, Map<string, { deals: number; conv: number }>>();
  for (const p of ptRes.data ?? []) { const m = ptByUser.get(p.user_id) ?? new Map(); m.set(p.property_type, { deals: p.deals_count, conv: p.conversion_rate }); ptByUser.set(p.user_id, m); }

  const agents: AgentForRouting[] = [];
  const byUser = new Map<string, AgentForRouting>();
  for (const t of twins) {
    const scores: AgentScores = { agent_score: t.agent_score, territory_score: t.territory_score, conversion_score: t.conversion_score, responsiveness_score: t.responsiveness_score, expertise_score: t.expertise_score, customer_score: t.customer_score, workload_score: t.workload_score, momentum_score: t.momentum_score, satisfaction_score: t.satisfaction_score, reliability_score: t.reliability_score };
    const a: AgentForRouting = { userId: t.user_id, name: names.get(t.user_id) ?? "סוכן", scores, avgDaysToClose: t.avg_days_to_close, avgDealValue: t.total_closed_deals ? Math.round(t.total_revenue / t.total_closed_deals) : 0, localityDeals: 0, localityConversion: 0, propertyTypeConversion: 0, propertyTypeDeals: 0 };
    agents.push(a); byUser.set(t.user_id, a);
  }
  return { agents, byUser };
}

export interface RoutingSummary { routed: number }

export async function routeUnassignedLeads(): Promise<RoutingSummary> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const orgId = profile.org_id;
  const { agents } = await loadAgentsForRouting(supabase);
  if (!agents.length) return { routed: 0 };

  const [locRes, ptRes, leadsRes, propsRes] = await Promise.all([
    supabase.from("agent_locality_performance").select("user_id,locality,deals_count,conversion_rate"),
    supabase.from("agent_property_type_performance").select("user_id,property_type,deals_count,conversion_rate"),
    supabase.from("leads").select("id,stage,owner_id,property_id,intent,score").in("stage", ["new", "contacted"]).limit(100),
    supabase.from("properties").select("id,city,type"),
  ]);
  const propMap = new Map((propsRes.data ?? []).map((p) => [p.id, { city: p.city, type: p.type }]));
  const locByUser = new Map<string, Map<string, { deals: number; conv: number }>>();
  for (const l of locRes.data ?? []) { const m = locByUser.get(l.user_id) ?? new Map(); m.set(cityNorm(l.locality), { deals: l.deals_count, conv: l.conversion_rate }); locByUser.set(l.user_id, m); }
  const ptByUser = new Map<string, Map<string, { deals: number; conv: number }>>();
  for (const p of ptRes.data ?? []) { const m = ptByUser.get(p.user_id) ?? new Map(); m.set(p.property_type, { deals: p.deals_count, conv: p.conversion_rate }); ptByUser.set(p.user_id, m); }

  const leads = leadsRes.data ?? [];
  let routed = 0;
  for (const lead of leads) {
    const p = lead.property_id ? propMap.get(lead.property_id) : null;
    const ctx: LeadContext = { locality: p?.city ?? null, propertyType: p?.type ?? null, dealType: lead.intent, leadScore: lead.score };
    const cityKey = cityNorm(p?.city);
    const enriched = agents.map((a) => {
      const loc = locByUser.get(a.userId)?.get(cityKey);
      const pt = p?.type ? ptByUser.get(a.userId)?.get(p.type) : undefined;
      return { ...a, localityDeals: loc?.deals ?? 0, localityConversion: loc?.conv ?? 0, propertyTypeDeals: pt?.deals ?? 0, propertyTypeConversion: pt?.conv ?? 0 };
    });
    const candidates = rankAgentsForLead(ctx, enriched);
    if (!candidates.length) continue;
    const top = candidates[0];
    const conf = routingConfidence(candidates);
    const { data: rp } = await supabase.from("lead_routing_profiles").upsert({
      organization_id: orgId, lead_id: lead.id, recommended_agent_id: top.userId, assigned_agent_id: lead.owner_id,
      routing_score: top.score, confidence_score: conf, expected_conversion_probability: top.probability,
      expected_days_to_close: top.expectedDaysToClose, expected_revenue: top.expectedRevenue,
      routing_reason: top.reasons.join(" · "), routing_factors: { reasons: top.reasons } as never,
      ai_routing_reason: `מומלץ ${top.name}: ${top.reasons.join(", ")}. צפי סגירה ${top.probability}%.`,
      status: lead.owner_id ? "assigned" : "pending",
    } as never, { onConflict: "organization_id,lead_id" }).select("id").single();
    if (rp?.id) {
      await supabase.from("lead_routing_candidates").delete().eq("routing_profile_id", rp.id);
      await supabase.from("lead_routing_candidates").insert(candidates.map((c) => ({ organization_id: orgId, routing_profile_id: rp.id, user_id: c.userId, rank: c.rank, score: c.score, probability: c.probability, reason: c.reasons.join(" · ") })) as never);
    }
    routed++;
  }
  return { routed };
}

export async function assignLead(leadId: string, agentId: string): Promise<void> {
  const profile = await requireProfile();
  const supabase = await createClient();
  await supabase.from("leads").update({ owner_id: agentId }).eq("id", leadId);
  await supabase.from("lead_routing_profiles").update({ assigned_agent_id: agentId, status: "assigned" }).eq("lead_id", leadId);
  await logActivityEvent({ eventType: "lead.routed_assigned", entityType: "lead", entityId: leadId, title: "ליד הוקצה לסוכן" });
  void profile;
}

// ── Read model ───────────────────────────────────────────────────────────────
export interface RoutingBoard {
  cc: { incoming: number; queue: number; recommended: number; assignedToday: number; routingAccuracy: number; overloaded: number };
  twins: (AgentTwinRow & { name: string })[];
  incoming: { leadId: string; leadName: string; recommended: string | null; probability: number; score: number; city: string | null }[];
  territory: { locality: string; topAgent: string; deals: number }[];
  signals: { type: string; title: string }[];
}

export async function getRoutingBoard(): Promise<RoutingBoard> {
  const supabase = await createClient();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const [twinsRes, profilesRes, locRes, newLeadsRes] = await Promise.all([
    supabase.from("agent_intelligence_profiles").select("*").order("agent_score", { ascending: false }).limit(100),
    supabase.from("lead_routing_profiles").select("*").limit(300),
    supabase.from("agent_locality_performance").select("user_id,locality,deals_count").order("deals_count", { ascending: false }).limit(500),
    supabase.from("leads").select("id,full_name,stage,property_id").in("stage", ["new", "contacted"]).limit(100),
  ]);
  const twinRows = twinsRes.data ?? [];
  const userIds = twinRows.map((t) => t.user_id);
  const names = new Map<string, string>();
  if (userIds.length) { const { data } = await supabase.from("users").select("id,full_name").in("id", userIds); for (const u of data ?? []) names.set(u.id, u.full_name); }
  const twins = twinRows.map((t) => ({ ...t, name: names.get(t.user_id) ?? "סוכן" }));

  const profiles = profilesRes.data ?? [];
  const profByLead = new Map(profiles.map((p) => [p.lead_id, p]));
  // Property city for incoming leads.
  const propIds = (newLeadsRes.data ?? []).map((l) => l.property_id).filter((x): x is string => !!x);
  const cityByProp = new Map<string, string | null>();
  if (propIds.length) { const { data } = await supabase.from("properties").select("id,city").in("id", propIds); for (const p of data ?? []) cityByProp.set(p.id, p.city); }
  const incoming = (newLeadsRes.data ?? []).map((l) => {
    const rp = profByLead.get(l.id);
    return { leadId: l.id, leadName: l.full_name, recommended: rp?.recommended_agent_id ? names.get(rp.recommended_agent_id) ?? "—" : null, probability: rp?.expected_conversion_probability ?? 0, score: rp?.routing_score ?? 0, city: l.property_id ? cityByProp.get(l.property_id) ?? null : null };
  });

  // Territory leaders.
  const locLeader = new Map<string, { user: string; deals: number }>();
  for (const l of locRes.data ?? []) { const cur = locLeader.get(l.locality); if (!cur || l.deals_count > cur.deals) locLeader.set(l.locality, { user: names.get(l.user_id) ?? "—", deals: l.deals_count }); }
  const territory = [...locLeader.entries()].map(([locality, v]) => ({ locality, topAgent: v.user, deals: v.deals })).sort((a, b) => b.deals - a.deals).slice(0, 12);

  // Routing accuracy: of assigned decisions, how many went to the recommended agent.
  const assigned = profiles.filter((p) => p.status === "assigned" && p.assigned_agent_id);
  const correct = assigned.filter((p) => p.assigned_agent_id === p.recommended_agent_id).length;
  const routingAccuracy = assigned.length ? Math.round((correct / assigned.length) * 100) : 0;

  const overloaded = twins.filter((t) => t.workload_score < 35).length;
  const signals: { type: string; title: string }[] = [];
  for (const t of twins) if (t.agent_score >= 70 && t.workload_score < 35) signals.push({ type: "overloaded_top", title: `${t.name} עמוס מדי — מוביל ביצועים בעומס גבוה` });
  for (const ter of territory) if (ter.deals < 2) signals.push({ type: "weak_locality", title: `${ter.locality} — אין מומחה חזק מספיק` });

  return {
    cc: { incoming: incoming.length, queue: profiles.filter((p) => p.status === "pending").length, recommended: profiles.filter((p) => p.recommended_agent_id).length, assignedToday: profiles.filter((p) => p.status === "assigned" && p.updated_at >= todayStart.toISOString()).length, routingAccuracy, overloaded },
    twins, incoming, territory, signals: signals.slice(0, 10),
  };
}
