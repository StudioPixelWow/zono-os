// ============================================================================
// ZONO — Communication Intelligence OS · Service (server-only)
// ----------------------------------------------------------------------------
// Ingests interactions from any source and turns them into intelligence:
// events, sentiment, intents, objections, extracted entities, commitments,
// risks, opportunities, durable client + conversation memory, and a unified
// timeline. Deterministic. Reuses communication_threads + communication_*
// (commitments/followups). No tokens, no scraping, no auto-send.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Json } from "@/lib/supabase/types";
import {
  detectIntents, detectObjections, detectSentiment, extractEntities, detectCommitments,
  computeRisks, computeOpportunities, mergeClientMemory, classifyEngagement, agentAIAnswers,
  INTENT_LABELS, OBJECTION_LABELS, RISK_LABELS, OPP_LABELS, SOURCE_LABELS,
  type CommIntent, type ClientMemoryState, type MemoryDelta,
} from "./engine";

const DAY = 86_400_000;
const daysSince = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : null);

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  let isManager = false;
  try { const { data } = await supabase.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { /* default */ }
  return { userId: user.id, orgId: profile.org_id, isManager, supabase };
}
type DB = Awaited<ReturnType<typeof createClient>>;

async function entityLabel(supabase: DB, orgId: string, entityType: string, entityId: string): Promise<string> {
  const table = entityType === "seller" ? "sellers" : entityType === "buyer" ? "buyers" : entityType === "lead" ? "leads" : null;
  if (!table) return "לקוח";
  try {
    const { data } = await supabase.from(table).select("full_name").eq("org_id", orgId).eq("id", entityId).maybeSingle();
    return (data as { full_name?: string } | null)?.full_name ?? "לקוח";
  } catch { return "לקוח"; }
}

// ── DTOs ─────────────────────────────────────────────────────────────────────
export interface TimelineItem {
  id: string; source: string; sourceLabel: string; channel: string | null; direction: string | null;
  title: string | null; body: string | null; intent: string | null; sentiment: string | null; occurred_at: string;
}
export interface ObjectionItem { id: string; entity_type: string; entity_id: string; objection_type: string; label: string; severity: string; detail: string | null; resolved: boolean; detected_at: string }
export interface RiskItem { id: string; entity_type: string; entity_id: string; risk_type: string; label: string; severity: string; score: number; reason: string | null; recommended_action: string | null }
export interface OppItem { id: string; entity_type: string; entity_id: string; opportunity_type: string; label: string; score: number; reason: string | null; recommended_action: string | null }
export interface CommitmentItem { id: string; entity_type: string; entity_id: string; commitment_text: string; status: string; due_date: string | null }
export interface CommandCenterKpis { newObjections: number; brokenCommitments: number; communicationRisks: number; readyBuyers: number; readySellers: number; openOpportunities: number; recentEvents: number }
export interface CommunicationCommandCenter {
  kpis: CommandCenterKpis;
  timeline: TimelineItem[];
  objections: ObjectionItem[];
  risks: RiskItem[];
  opportunities: OppItem[];
  brokenCommitments: CommitmentItem[];
  isManager: boolean;
}

// ── ingest: the heart of the OS ───────────────────────────────────────────────
export interface IngestInput {
  entityType: string; entityId: string; source: string; direction?: string; channel?: string;
  title?: string; body?: string; transcript?: string; isVoiceNote?: boolean; threadId?: string;
  relatedEntityType?: string; relatedEntityId?: string; occurredAt?: string;
}
export async function ingestCommunication(input: IngestInput): Promise<{ eventId: string; intent: string; sentiment: string; objections: number }> {
  const { orgId, userId, supabase } = await ctx();
  const nowIso = input.occurredAt ?? new Date().toISOString();
  const text = [input.title, input.body, input.transcript].filter(Boolean).join(". ");
  const intents = detectIntents(text);
  const intent = intents[0]?.intent ?? "unknown";
  const { sentiment, score: sentimentScore } = detectSentiment(text);
  const objections = detectObjections(text);
  const entities = extractEntities(text);
  const commitments = detectCommitments(text);

  // 1) event
  const { data: ev, error } = await supabase.from("communication_events").insert({
    org_id: orgId, thread_id: input.threadId ?? null, actor_user_id: userId, source: input.source,
    channel: input.channel ?? input.source, direction: input.direction ?? "inbound",
    entity_type: input.entityType, entity_id: input.entityId, related_entity_type: input.relatedEntityType ?? null, related_entity_id: input.relatedEntityId ?? null,
    title: input.title ?? null, body: input.body ?? null, transcript: input.transcript ?? null, is_voice_note: Boolean(input.isVoiceNote),
    intent, sentiment, occurred_at: nowIso,
  }).select("id").single();
  if (error || !ev) throw new Error(error?.message ?? "כתיבת האירוע נכשלה");
  const eventId = (ev as { id: string }).id;

  // 2) sentiment + intents
  await supabase.from("communication_sentiment").insert({ org_id: orgId, entity_type: input.entityType, entity_id: input.entityId, event_id: eventId, sentiment, score: sentimentScore });
  if (intents.length) await supabase.from("communication_intents").insert(intents.map((i) => ({ org_id: orgId, entity_type: input.entityType, entity_id: input.entityId, event_id: eventId, intent: i.intent, score: i.score })));

  // 3) objections (only insert ones not already open of same type)
  if (objections.length) {
    const { data: existing } = await supabase.from("communication_objections").select("objection_type").eq("org_id", orgId).eq("entity_type", input.entityType).eq("entity_id", input.entityId).eq("resolved", false);
    const openTypes = new Set(((existing ?? []) as { objection_type: string }[]).map((o) => o.objection_type));
    const fresh = objections.filter((o) => !openTypes.has(o.type));
    if (fresh.length) await supabase.from("communication_objections").insert(fresh.map((o) => ({ org_id: orgId, entity_type: input.entityType, entity_id: input.entityId, event_id: eventId, objection_type: o.type, severity: o.severity, detail: text.slice(0, 240) })));
  }

  // 4) extracted entities
  if (entities.length) await supabase.from("communication_entities").insert(entities.map((e) => ({ org_id: orgId, event_id: eventId, entity_type: input.entityType, entity_id: input.entityId, extracted_kind: e.kind, raw_value: e.raw, normalized_value: e.normalized, confidence_score: e.confidence })));

  // 5) commitments → reuse communication_commitments
  if (commitments.length) await supabase.from("communication_commitments").insert(commitments.map((c) => ({ org_id: orgId, entity_type: input.entityType, entity_id: input.entityId, commitment_text: c.text, promised_by_user_id: c.party === "agent" ? userId : null, promised_to_type: c.party === "client" ? input.entityType : null, status: "open" })));

  // 6) memory updates
  await updateClientMemory(supabase, orgId, input.entityType, input.entityId, entities, nowIso);
  await updateConversationMemory(supabase, orgId, input.entityType, input.entityId, input.threadId ?? null, intent, sentiment, text, nowIso);

  // 7) recompute risk + opportunity snapshot for this entity
  await recomputeEntity(supabase, orgId, input.entityType, input.entityId);

  return { eventId, intent, sentiment, objections: objections.length };
}

// ── memory ────────────────────────────────────────────────────────────────────
async function updateClientMemory(supabase: DB, orgId: string, entityType: string, entityId: string, entities: ReturnType<typeof extractEntities>, nowIso: string) {
  const delta: MemoryDelta = {
    cities: entities.filter((e) => e.kind === "city").map((e) => e.normalized),
    budget: entities.find((e) => e.kind === "budget") ? Number(entities.find((e) => e.kind === "budget")!.normalized) : null,
    timeline: entities.find((e) => e.kind === "timeline")?.normalized ?? null,
  };
  const { data: prev } = await supabase.from("client_memory").select("id,desired_cities,desired_neighborhoods,property_types,motivations,budget,budget_evolution,timeline,communication_style").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).maybeSingle();
  const base: ClientMemoryState = prev ? {
    desired_cities: (prev as Record<string, Json>).desired_cities, desired_neighborhoods: (prev as Record<string, Json>).desired_neighborhoods,
    property_types: (prev as Record<string, Json>).property_types, motivations: (prev as Record<string, Json>).motivations,
    budget: (prev as Record<string, Json>).budget, budget_evolution: (prev as Record<string, Json>).budget_evolution,
    timeline: (prev as { timeline: string | null }).timeline, communication_style: (prev as { communication_style: string | null }).communication_style,
  } : { desired_cities: [], desired_neighborhoods: [], property_types: [], motivations: [], budget: {}, budget_evolution: [], timeline: null, communication_style: null };
  const merged = mergeClientMemory(base, delta, nowIso);
  const payload = {
    desired_cities: merged.desired_cities as Json, desired_neighborhoods: merged.desired_neighborhoods as Json, property_types: merged.property_types as Json,
    motivations: merged.motivations as Json, budget: merged.budget as Json, budget_evolution: merged.budget_evolution as Json,
    timeline: merged.timeline, communication_style: merged.communication_style,
  };
  if (prev) await supabase.from("client_memory").update(payload).eq("id", (prev as { id: string }).id);
  else await supabase.from("client_memory").insert({ org_id: orgId, entity_type: entityType, entity_id: entityId, ...payload });
}

async function updateConversationMemory(supabase: DB, orgId: string, entityType: string, entityId: string, threadId: string | null, intent: string, sentiment: string, text: string, nowIso: string) {
  const { data: prev } = await supabase.from("conversation_memory").select("id,message_count,open_loops").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).eq("thread_id", threadId ?? "").maybeSingle();
  const summary = text.slice(0, 200);
  if (prev) {
    await supabase.from("conversation_memory").update({ last_summary: summary, last_intent: intent, last_sentiment: sentiment, message_count: ((prev as { message_count: number }).message_count ?? 0) + 1, last_event_at: nowIso }).eq("id", (prev as { id: string }).id);
  } else {
    await supabase.from("conversation_memory").insert({ org_id: orgId, entity_type: entityType, entity_id: entityId, thread_id: threadId, last_summary: summary, last_intent: intent, last_sentiment: sentiment, message_count: 1, last_event_at: nowIso });
  }
}

// ── recompute risks + opportunities for one entity ────────────────────────────
export async function recomputeEntity(supabase: DB, orgId: string, entityType: string, entityId: string): Promise<{ risks: number; opportunities: number }> {
  // gather signals
  const { data: lastEvent } = await supabase.from("communication_events").select("occurred_at,direction").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).order("occurred_at", { ascending: false }).limit(1).maybeSingle();
  const lastAt = (lastEvent as { occurred_at?: string } | null)?.occurred_at ?? null;
  const { data: lastInbound } = await supabase.from("communication_events").select("occurred_at").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).eq("direction", "inbound").order("occurred_at", { ascending: false }).limit(1).maybeSingle();
  const lastInboundAt = (lastInbound as { occurred_at?: string } | null)?.occurred_at ?? null;

  const { count: openObjections } = await supabase.from("communication_objections").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).eq("resolved", false);
  const { count: broken } = await supabase.from("communication_commitments").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).eq("status", "broken");
  const { count: overdue } = await supabase.from("communication_commitments").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).eq("status", "open").lt("due_date", new Date().toISOString());

  const { data: sentiments } = await supabase.from("communication_sentiment").select("score,sentiment").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).order("detected_at", { ascending: false }).limit(5);
  const sentRows = (sentiments ?? []) as { score: number; sentiment: string }[];
  const negStreak = countStreak(sentRows.map((r) => r.score < 40));
  const posStreak = countStreak(sentRows.map((r) => r.score >= 70));

  const { data: intentRows } = await supabase.from("communication_intents").select("intent").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).order("detected_at", { ascending: false }).limit(6);
  const recentIntents = ((intentRows ?? []) as { intent: string }[]).map((r) => r.intent as CommIntent);

  const { count: outboundCount } = await supabase.from("communication_events").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).eq("direction", "outbound");
  const unanswered = lastInboundAt && lastAt && new Date(lastAt) > new Date(lastInboundAt) ? Math.min(5, outboundCount ?? 0) : 0;

  const leadScore = await fetchLeadScore(supabase, orgId, entityType, entityId);
  const dealClosedRecently = await hasRecentClosedDeal(supabase, orgId, entityType, entityId);
  const hasActiveDeal = await hasOpenDeal(supabase, orgId, entityType, entityId);

  const risks = computeRisks({
    entityType, daysSinceContact: daysSince(lastAt), daysSinceInbound: daysSince(lastInboundAt),
    unansweredOutbound: unanswered, brokenCommitments: broken ?? 0, overdueCommitments: overdue ?? 0,
    negativeSentimentStreak: negStreak, openObjections: openObjections ?? 0, hasActiveDeal, leadScore,
  });
  const opps = computeOpportunities({
    entityType, positiveSentimentStreak: posStreak, recentIntents, daysSinceContact: daysSince(lastAt),
    openObjections: openObjections ?? 0, dealClosedRecently, engagementScore: 50, leadScore,
  });

  // replace open snapshot rows for this entity (keep deterministic, no dupes)
  await supabase.from("communication_risks").delete().eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).eq("status", "open");
  if (risks.length) await supabase.from("communication_risks").insert(risks.map((r) => ({ org_id: orgId, entity_type: entityType, entity_id: entityId, risk_type: r.type, severity: r.severity, score: r.score, reason: r.reason, recommended_action: r.recommended_action, status: "open" })));
  await supabase.from("communication_opportunities").delete().eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).eq("status", "open");
  if (opps.length) await supabase.from("communication_opportunities").insert(opps.map((o) => ({ org_id: orgId, entity_type: entityType, entity_id: entityId, opportunity_type: o.type, score: o.score, reason: o.reason, recommended_action: o.recommended_action, status: "open" })));

  // engagement → client_memory
  const engagement = classifyEngagement(daysSince(lastInboundAt), sentRows.length, sentRows[0]?.score ?? 55);
  await supabase.from("client_memory").update({ engagement_score: engagement === "engaged" ? 80 : engagement === "neutral" ? 50 : 25 }).eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId);

  return { risks: risks.length, opportunities: opps.length };
}

function countStreak(flags: boolean[]): number { let n = 0; for (const f of flags) { if (f) n++; else break; } return n; }
async function fetchLeadScore(supabase: DB, orgId: string, entityType: string, entityId: string): Promise<number> {
  const table = entityType === "buyer" ? "buyer_intelligence_profiles" : entityType === "seller" ? "seller_intelligence_profiles" : null;
  if (!table) return 50;
  try { const { data } = await supabase.from(table).select("overall_score").eq("org_id", orgId).eq((entityType === "buyer" ? "buyer_id" : "seller_id") as never, entityId).maybeSingle(); return (data as { overall_score?: number } | null)?.overall_score ?? 50; } catch { return 50; }
}
async function hasOpenDeal(supabase: DB, orgId: string, entityType: string, entityId: string): Promise<boolean> {
  try { const col = entityType === "buyer" ? "buyer_id" : entityType === "seller" ? "seller_id" : null; if (!col) return false; const { count } = await supabase.from("deals").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq(col, entityId).not("status", "in", "(won,lost,closed)"); return (count ?? 0) > 0; } catch { return false; }
}
async function hasRecentClosedDeal(supabase: DB, orgId: string, entityType: string, entityId: string): Promise<boolean> {
  try { const col = entityType === "buyer" ? "buyer_id" : entityType === "seller" ? "seller_id" : null; if (!col) return false; const since = new Date(Date.now() - 30 * DAY).toISOString(); const { count } = await supabase.from("deals").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq(col as never, entityId).eq("status", "won").gte("updated_at", since); return (count ?? 0) > 0; } catch { return false; }
}

// ── command center ─────────────────────────────────────────────────────────────
export async function getCommunicationCommandCenter(): Promise<CommunicationCommandCenter> {
  const { orgId, isManager, supabase } = await ctx();
  const since7 = new Date(Date.now() - 7 * DAY).toISOString();

  const { data: tl } = await supabase.from("communication_events").select("id,source,channel,direction,title,body,intent,sentiment,occurred_at").eq("org_id", orgId).order("occurred_at", { ascending: false }).limit(60);
  const timeline: TimelineItem[] = ((tl ?? []) as Record<string, unknown>[]).map((e) => ({
    id: e.id as string, source: e.source as string, sourceLabel: SOURCE_LABELS[e.source as string] ?? (e.source as string), channel: (e.channel as string) ?? null, direction: (e.direction as string) ?? null,
    title: (e.title as string) ?? null, body: (e.body as string) ?? null, intent: e.intent ? INTENT_LABELS[e.intent as string] ?? (e.intent as string) : null,
    sentiment: (e.sentiment as string) ?? null, occurred_at: e.occurred_at as string,
  }));

  const { data: obj } = await supabase.from("communication_objections").select("id,entity_type,entity_id,objection_type,severity,detail,resolved,detected_at").eq("org_id", orgId).eq("resolved", false).order("detected_at", { ascending: false }).limit(40);
  const objections: ObjectionItem[] = ((obj ?? []) as Record<string, unknown>[]).map((o) => ({ id: o.id as string, entity_type: o.entity_type as string, entity_id: o.entity_id as string, objection_type: o.objection_type as string, label: OBJECTION_LABELS[o.objection_type as string] ?? (o.objection_type as string), severity: o.severity as string, detail: (o.detail as string) ?? null, resolved: false, detected_at: o.detected_at as string }));

  const { data: rk } = await supabase.from("communication_risks").select("id,entity_type,entity_id,risk_type,severity,score,reason,recommended_action").eq("org_id", orgId).eq("status", "open").order("score", { ascending: false }).limit(40);
  const risks: RiskItem[] = ((rk ?? []) as Record<string, unknown>[]).map((r) => ({ id: r.id as string, entity_type: r.entity_type as string, entity_id: r.entity_id as string, risk_type: r.risk_type as string, label: RISK_LABELS[r.risk_type as string] ?? (r.risk_type as string), severity: r.severity as string, score: (r.score as number) ?? 0, reason: (r.reason as string) ?? null, recommended_action: (r.recommended_action as string) ?? null }));

  const { data: op } = await supabase.from("communication_opportunities").select("id,entity_type,entity_id,opportunity_type,score,reason,recommended_action").eq("org_id", orgId).eq("status", "open").order("score", { ascending: false }).limit(40);
  const opportunities: OppItem[] = ((op ?? []) as Record<string, unknown>[]).map((o) => ({ id: o.id as string, entity_type: o.entity_type as string, entity_id: o.entity_id as string, opportunity_type: o.opportunity_type as string, label: OPP_LABELS[o.opportunity_type as string] ?? (o.opportunity_type as string), score: (o.score as number) ?? 0, reason: (o.reason as string) ?? null, recommended_action: (o.recommended_action as string) ?? null }));

  const { data: bc } = await supabase.from("communication_commitments").select("id,entity_type,entity_id,commitment_text,status,due_date").eq("org_id", orgId).eq("status", "broken").order("updated_at", { ascending: false }).limit(30);
  const brokenCommitments: CommitmentItem[] = ((bc ?? []) as Record<string, unknown>[]).map((c) => ({ id: c.id as string, entity_type: c.entity_type as string, entity_id: c.entity_id as string, commitment_text: c.commitment_text as string, status: c.status as string, due_date: (c.due_date as string) ?? null }));

  const { count: recentEvents } = await supabase.from("communication_events").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("occurred_at", since7);
  const { count: newObjections } = await supabase.from("communication_objections").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("resolved", false).gte("detected_at", since7);

  const kpis: CommandCenterKpis = {
    newObjections: newObjections ?? 0, brokenCommitments: brokenCommitments.length, communicationRisks: risks.length,
    readyBuyers: opportunities.filter((o) => o.opportunity_type === "ready_buyer").length,
    readySellers: opportunities.filter((o) => o.opportunity_type === "ready_seller").length,
    openOpportunities: opportunities.length, recentEvents: recentEvents ?? 0,
  };
  return { kpis, timeline, objections, risks, opportunities, brokenCommitments, isManager };
}

// ── unified timeline for a single entity ───────────────────────────────────────
export async function getUnifiedTimeline(entityType: string, entityId: string): Promise<TimelineItem[]> {
  const { orgId, supabase } = await ctx();
  const { data } = await supabase.from("communication_events").select("id,source,channel,direction,title,body,intent,sentiment,occurred_at").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).order("occurred_at", { ascending: false }).limit(100);
  return ((data ?? []) as Record<string, unknown>[]).map((e) => ({
    id: e.id as string, source: e.source as string, sourceLabel: SOURCE_LABELS[e.source as string] ?? (e.source as string), channel: (e.channel as string) ?? null, direction: (e.direction as string) ?? null,
    title: (e.title as string) ?? null, body: (e.body as string) ?? null, intent: e.intent ? INTENT_LABELS[e.intent as string] ?? (e.intent as string) : null, sentiment: (e.sentiment as string) ?? null, occurred_at: e.occurred_at as string,
  }));
}

// ── agent-AI: what happened / changed / next / blocking ────────────────────────
export async function getAgentAI(entityType: string, entityId: string): Promise<{ whatHappened: string; whatChanged: string; whatNext: string; whatBlocks: string; label: string }> {
  const { orgId, supabase } = await ctx();
  const label = await entityLabel(supabase, orgId, entityType, entityId);
  const { data: cm } = await supabase.from("conversation_memory").select("last_summary").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).order("last_event_at", { ascending: false }).limit(1).maybeSingle();
  const { data: sum } = await supabase.from("communication_summaries").select("what_changed,next_step").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).order("generated_at", { ascending: false }).limit(1).maybeSingle();
  const { data: rk } = await supabase.from("communication_risks").select("risk_type,recommended_action").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).eq("status", "open").order("score", { ascending: false }).limit(1).maybeSingle();
  const { data: op } = await supabase.from("communication_opportunities").select("opportunity_type,recommended_action").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).eq("status", "open").order("score", { ascending: false }).limit(1).maybeSingle();
  const { data: objs } = await supabase.from("communication_objections").select("objection_type").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).eq("resolved", false).limit(5);
  const { count: broken } = await supabase.from("communication_commitments").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).eq("status", "broken");

  const rkRow = rk as { risk_type?: string; recommended_action?: string } | null;
  const opRow = op as { opportunity_type?: string; recommended_action?: string } | null;
  const ans = agentAIAnswers({
    entityLabel: label,
    lastSummary: (cm as { last_summary?: string } | null)?.last_summary ?? null,
    whatChanged: (sum as { what_changed?: string } | null)?.what_changed ?? null,
    topRisk: rkRow ? { label: RISK_LABELS[rkRow.risk_type ?? ""] ?? "סיכון", action: rkRow.recommended_action ?? "" } : null,
    topOpp: opRow ? { label: OPP_LABELS[opRow.opportunity_type ?? ""] ?? "הזדמנות", action: opRow.recommended_action ?? "" } : null,
    openObjections: ((objs ?? []) as { objection_type: string }[]).map((o) => ({ label: OBJECTION_LABELS[o.objection_type] ?? o.objection_type })),
    brokenCommitments: broken ?? 0,
    nextStep: (sum as { next_step?: string } | null)?.next_step ?? null,
  });
  return { ...ans, label };
}

// ── client memory read ─────────────────────────────────────────────────────────
export async function getClientMemory(entityType: string, entityId: string) {
  const { orgId, supabase } = await ctx();
  const { data } = await supabase.from("client_memory").select("*").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).maybeSingle();
  return data as Record<string, unknown> | null;
}

// ── objection / commitment resolution ───────────────────────────────────────────
export async function resolveObjection(objectionId: string, method: string): Promise<void> {
  const { orgId, supabase } = await ctx();
  await supabase.from("communication_objections").update({ resolved: true, resolution_method: method, resolved_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", objectionId);
}
export async function markCommitmentFulfilled(commitmentId: string): Promise<void> {
  const { orgId, supabase } = await ctx();
  await supabase.from("communication_commitments").update({ status: "fulfilled", fulfilled_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", commitmentId);
}
export async function markOpportunityActioned(opportunityId: string): Promise<void> {
  const { orgId, supabase } = await ctx();
  await supabase.from("communication_opportunities").update({ status: "actioned", acted_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", opportunityId);
}

// ── org-wide recompute (cron-friendly) ──────────────────────────────────────────
export async function recomputeAllEntities(): Promise<{ entities: number }> {
  const { orgId, supabase } = await ctx();
  const { data } = await supabase.from("communication_events").select("entity_type,entity_id").eq("org_id", orgId).order("occurred_at", { ascending: false }).limit(500);
  const seen = new Set<string>();
  const pairs: { entity_type: string; entity_id: string }[] = [];
  for (const r of (data ?? []) as { entity_type: string; entity_id: string }[]) { const k = r.entity_type + r.entity_id; if (!seen.has(k)) { seen.add(k); pairs.push(r); } }
  for (const p of pairs.slice(0, 100)) { try { await recomputeEntity(supabase, orgId, p.entity_type, p.entity_id); } catch { /* isolate */ } }
  return { entities: pairs.length };
}

export type { Json };
