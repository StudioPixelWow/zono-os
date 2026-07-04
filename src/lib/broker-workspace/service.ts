// ============================================================================
// 👤 ZONO Broker Personal Workspace™ — server service (server-only). 35.0.
// REUSES every existing org-scoped engine (Buyer/Seller/Lead/Listing agents,
// Mission Engine action center, Agent Framework inbox, Workflow Builder, Ask
// ZONO) and SCOPES the result to the signed-in broker via owner_id / mission
// owner. Adds NO new engine and NO schema. Reads meetings + suggested calendar
// plans directly (no calendar engine exists). Nothing auto-sends or auto-books.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { getBuyerAgentScorecards } from "@/lib/buyer-agent/service";
import { getSellerAgentScorecards } from "@/lib/seller-agent/service";
import { getLeadAgentScorecards } from "@/lib/lead-agent/service";
import { getListingScorecards } from "@/lib/listing-agent/service";
import { getActionCenter } from "@/lib/mission-engine/service";
import { getAgentsDashboard } from "@/lib/agent-framework/service";
import { listActiveWorkflows } from "@/lib/workflow-builder/persist";
import { askZono } from "@/lib/ask-zono/service";
import { getBrokerWhatsapp } from "@/lib/whatsapp/inbox-service";
import { getBrokerFacebook } from "@/lib/facebook-home/service";
import { getBrokerWebsite } from "@/lib/website-builder/service";
import { getBrokerTerritory } from "@/lib/territory-os/service";
import { assembleBrokerWorkspace } from "./assemble";
import type { BrokerWorkspace, BrokerWorkspaceInput, OwnedSets, ScoredEntity, WsMission, WsInboxItem, WsWorkflow, WsMeeting, WsSuggestedEvent, Impact } from "./types";

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const impactFromScore = (p: number): Impact => (p >= 80 ? "high" : p >= 60 ? "medium" : "low");

interface BrokerCtx { orgId: string | null; brokerId: string | null; brokerName: string }

async function resolveBroker(): Promise<BrokerCtx> {
  const s = await getSessionContext();
  const orgId = s.profile?.org_id ?? s.organization?.id ?? null;
  const brokerId = s.user?.id ?? null;
  const p = s.profile as unknown as { full_name?: string } | null;
  const brokerName = p?.full_name || s.user?.email || "הסוכן";
  return { orgId, brokerId, brokerName };
}

/** Owned entity ids + a recency map (updated_at proxy) for the current broker. */
async function loadOwned(orgId: string | null, brokerId: string | null): Promise<{ owned: OwnedSets; recency: Map<string, string | null>; note: string | null }> {
  const empty: OwnedSets = { buyerIds: [], sellerIds: [], leadIds: [], propertyIds: [] };
  const recency = new Map<string, string | null>();
  if (!orgId || !brokerId) return { owned: empty, recency, note: "לא זוהה סוכן מחובר — מציג מרחב עבודה ריק." };
  const db = await createClient();
  const load = async (table: string): Promise<string[]> => {
    const { data } = await db.from(table as never).select("id,updated_at").eq("owner_id" as never, brokerId as never);
    const rows = (data ?? []) as unknown as Row[];
    for (const r of rows) recency.set(str(r.id) ?? "", str(r.updated_at));
    return rows.map((r) => str(r.id)).filter((x): x is string => !!x);
  };
  const [buyerIds, sellerIds, leadIds, propertyIds] = await Promise.all([
    load("buyers"), load("sellers"), load("leads"), load("properties"),
  ]);
  const owned = { buyerIds, sellerIds, leadIds, propertyIds };
  const total = buyerIds.length + sellerIds.length + leadIds.length + propertyIds.length;
  return { owned, recency, note: total === 0 ? "עדיין אין רשומות המשויכות אליך (owner_id). שייך קונים/מוכרים/לידים/נכסים כדי לאכלס את מרחב העבודה." : null };
}

async function loadMeetings(orgId: string | null, brokerId: string | null): Promise<WsMeeting[]> {
  if (!orgId || !brokerId) return [];
  const db = await createClient();
  const { data } = await db.from("meetings" as never).select("id,title,type,status,start_at,end_at,buyer_id,seller_id,lead_id,property_id")
    .eq("organizer_id" as never, brokerId as never).order("start_at" as never, { ascending: true }).limit(40);
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: str(r.id) ?? "", title: str(r.title) ?? "פגישה", type: str(r.type), status: str(r.status),
    startAt: str(r.start_at), endAt: str(r.end_at),
    entityLabel: str(r.buyer_id) ? "קונה" : str(r.seller_id) ? "מוכר" : str(r.lead_id) ? "ליד" : str(r.property_id) ? "נכס" : null,
  }));
}

async function loadSuggested(orgId: string | null, propertyIds: string[]): Promise<WsSuggestedEvent[]> {
  if (!orgId || propertyIds.length === 0) return [];
  const db = await createClient();
  const { data } = await db.from("property_calendar_plans" as never).select("id,property_id,title,plan_type,suggested_date,status")
    .in("property_id" as never, propertyIds as never).eq("status" as never, "pending" as never).limit(20);
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: str(r.id) ?? "", propertyId: str(r.property_id), title: str(r.title) ?? "אירוע מוצע",
    planType: str(r.plan_type), suggestedDate: str(r.suggested_date), status: str(r.status) ?? "pending",
  }));
}

/** The broker's full personal workspace. Reuse-first, broker-scoped, read-only. */
export async function getBrokerWorkspace(): Promise<BrokerWorkspace> {
  const { orgId, brokerId, brokerName } = await resolveBroker();
  const notes: string[] = [];

  const { owned, recency, note } = await loadOwned(orgId, brokerId);
  if (note) notes.push(note);
  const ownedIds = new Set([...owned.buyerIds, ...owned.sellerIds, ...owned.leadIds, ...owned.propertyIds]);
  const rec = (id: string) => recency.get(id) ?? null;

  // Reuse the existing org-scoped engines in parallel.
  const [buyerOv, sellerOv, leadOv, listingOv, action, agents, workflows, meetings] = await Promise.all([
    getBuyerAgentScorecards(orgId, 200).catch(() => null),
    getSellerAgentScorecards(orgId, 200).catch(() => null),
    getLeadAgentScorecards(orgId, 200).catch(() => null),
    getListingScorecards(orgId, 200).catch(() => null),
    getActionCenter(orgId).catch(() => null),
    getAgentsDashboard(orgId).catch(() => null),
    listActiveWorkflows(orgId).catch(() => ({ rows: [], migrationRequired: false })),
    loadMeetings(orgId, brokerId),
  ]);
  const suggested = await loadSuggested(orgId, owned.propertyIds);
  const whatsapp = await getBrokerWhatsapp(brokerId).catch(() => undefined);
  const facebook = await getBrokerFacebook(brokerId).catch(() => undefined);
  const website = await getBrokerWebsite().catch(() => undefined);
  const territory = await getBrokerTerritory().catch(() => undefined);

  const buyerSet = new Set(owned.buyerIds), sellerSet = new Set(owned.sellerIds), leadSet = new Set(owned.leadIds), propSet = new Set(owned.propertyIds);

  // ── Map + broker-filter each engine's output → lean inputs ────────────────
  const buyers: ScoredEntity[] = (buyerOv?.scorecards ?? []).filter((c) => buyerSet.has(c.id)).map((c) => ({
    kind: "buyer", id: c.id, name: c.name, healthScore: c.health.buyerHealth, healthLabel: c.health.label,
    score: c.health.buyerHealth, stage: c.lifecycleStage, reason: c.aiRecommendation,
    lastActivityAt: rec(c.id), riskLabel: c.risks[0]?.title ?? null, href: `/buyers/${c.id}`,
  }));
  const sellers: ScoredEntity[] = (sellerOv?.scorecards ?? []).filter((c) => sellerSet.has(c.id)).map((c) => ({
    kind: "seller", id: c.id, name: c.name, healthScore: c.health.sellerHealth, healthLabel: c.health.label,
    score: c.health.churnRisk, stage: c.lifecycleStage, reason: c.aiRecommendation,
    lastActivityAt: rec(c.id), riskLabel: c.risks[0]?.title ?? (c.health.churnRisk >= 50 ? "סיכון נטישה" : null), href: `/sellers/${c.id}`,
  }));
  const leads: ScoredEntity[] = (leadOv?.scorecards ?? []).filter((c) => leadSet.has(c.id)).map((c) => ({
    kind: "lead", id: c.id, name: c.name, healthScore: c.health.leadHealth, healthLabel: c.health.label,
    score: c.health.urgency, stage: c.lifecycleStage, reason: c.aiRecommendation,
    lastActivityAt: rec(c.id), riskLabel: c.risks[0]?.title ?? null, href: `/leads/${c.id}`,
  }));
  const listings: ScoredEntity[] = (listingOv?.scorecards ?? []).filter((c) => propSet.has(c.id)).map((c) => ({
    kind: "property", id: c.id, name: c.title, healthScore: c.health.listingHealth, healthLabel: c.health.label,
    score: c.health.listingHealth, stage: c.status, reason: c.recommendations[0]?.reason ?? c.risks[0]?.title ?? null,
    lastActivityAt: rec(c.id), riskLabel: c.risks[0]?.title ?? null, href: `/properties/${c.id}`,
  }));

  const allMissions = action ? [...action.critical, ...action.highPriority, ...action.todaysMissions, ...action.inProgress, ...action.waiting] : [];
  const seen = new Set<string>();
  const missions: WsMission[] = allMissions.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true))).map((m) => ({
    id: m.id, title: m.goal || m.reason || m.missionType, entityType: m.entityType, entityId: m.entityId, entityName: m.entityName,
    owner: m.owner, priority: impactFromScore(m.priority), status: m.status, reason: m.reason, dueAt: m.dueAt,
  }));

  const inbox: WsInboxItem[] = (agents?.inbox ?? []).map((i) => ({
    id: i.id, agentName: i.agentName ?? null, entityType: i.entityType ?? null, entityId: i.entityId ?? null, entityName: i.entityName ?? null,
    recommendation: i.recommendation, reason: i.reason ?? null, impact: i.impact, confidence: typeof i.confidence === "number" ? i.confidence : null,
    status: i.status, requiresApproval: i.requiresApproval,
  }));

  const wfWorkflows: WsWorkflow[] = (workflows?.rows ?? []).map((r) => ({
    id: r.id, name: r.name, entityType: r.entityKind, entityId: r.entityId, status: r.status,
  }));

  if (buyerOv?.notes) notes.push(...buyerOv.notes.slice(0, 1));
  if (!ownedIds.size) notes.push("טיפ: ניתן לשייך רשומות אליך דרך owner_id בכל קונה/מוכר/ליד/נכס.");

  const input: BrokerWorkspaceInput = {
    brokerId, brokerName, owned, buyers, sellers, listings, leads,
    missions, inbox, workflows: wfWorkflows, meetings, suggested, whatsapp, facebook, website, territory, notes,
  };
  return assembleBrokerWorkspace(input);
}

/** Ask ZONO, scoped to THIS broker (reuses the org Ask ZONO with a scope preamble). */
export async function askBrokerZono(query: string): Promise<{ answer: string; confidence: number | null; limitations: string | null; engines: string[] }> {
  const { orgId, brokerName } = await resolveBroker();
  const scoped = `בהקשר של הסוכן "${brokerName}" בלבד (הרשומות שבטיפולו): ${query}`;
  const res = await askZono(orgId, scoped).catch(() => null);
  if (!res) return { answer: "לא ניתן לענות כרגע. נסה שוב.", confidence: null, limitations: "שגיאת מנוע", engines: [] };
  const r = res as unknown as { answer?: string; summary?: string; confidence?: number; limitations?: string[] | string; enginesUsed?: string[]; engines?: string[] };
  return {
    answer: r.answer ?? r.summary ?? "אין תשובה זמינה.",
    confidence: typeof r.confidence === "number" ? r.confidence : null,
    limitations: Array.isArray(r.limitations) ? r.limitations.join(" · ") : (r.limitations ?? null),
    engines: r.enginesUsed ?? r.engines ?? [],
  };
}
