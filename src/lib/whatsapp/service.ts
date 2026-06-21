// ============================================================================
// ZONO — WhatsApp Execution OS · Service (server-only)
// ----------------------------------------------------------------------------
// Command center + inbox + drafts/approvals + missed-call recovery + follow-ups
// + campaigns (manual queue) + smart links + daily missions. Compliance-first:
// connect stores STATUS only (no token); outbound is draft → approval → manual
// send (official API only when configured AND allowed). Nothing is auto-sent.
// ============================================================================
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { getSessionContext } from "@/lib/auth/session";
import {
  detectIntent, classifyRisk, qualify, extractActions, missedCallDraft,
  SEGMENTS, COVERAGE, coverageStats, type WaIntent,
} from "./engine";
import { randomBytes } from "crypto";

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  let isManager = false;
  try { const { data } = await supabase.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { /* default */ }
  return { userId: user.id, orgId: profile.org_id, isManager, supabase };
}
type DB = Awaited<ReturnType<typeof createClient>>;
async function audit(supabase: DB, orgId: string, actor: string, event: string, detail?: string | null, risk?: string | null, convId?: string | null) {
  try { await supabase.from("whatsapp_audit_logs").insert({ organization_id: orgId, actor_user_id: actor, event, detail: detail ?? null, risk_level: risk ?? null, conversation_id: convId ?? null }); } catch { /* best-effort */ }
}

// ── DTOs ─────────────────────────────────────────────────────────────────────
export interface ConversationSummary {
  id: string; name: string | null; state: string; intent: string; lead_score: number; unread: boolean;
  missed_call: boolean; last_message: string | null; agent_id: string | null; next_best_action: string | null; updated_at: string;
}
export interface DraftSummary { id: string; conversation_id: string | null; body: string; risk_level: string; requires_approval: boolean; approval_status: string; send_status: string }
export interface WhatsappCommandCenter {
  connectionStatus: string; autoReplyAllowed: boolean; approvalRequired: boolean;
  conversations: ConversationSummary[]; pendingApprovals: DraftSummary[];
  missedCalls: { id: string; name: string | null; recovery_status: string; occurred_at: string }[];
  followupsDue: { id: string; body: string | null; due_at: string | null; status: string }[];
  campaigns: { id: string; name: string; goal: string; status: string; audience_size: number; sent_count: number; replied_count: number }[];
  smartLinks: { id: string; slug: string; link_type: string; click_count: number; conversion_count: number }[];
  segments: { key: string; label: string }[];
  missions: { id: string; title: string; reason: string | null; recommended_action: string | null; priority: number }[];
  kpis: { needsReply: number; hotLeads: number; missedCalls: number; pendingApprovals: number; followupsDue: number; openConversations: number };
  isManager: boolean;
}

// ── command center ─────────────────────────────────────────────────────────
export async function getWhatsappCommandCenter(): Promise<WhatsappCommandCenter> {
  const { orgId, isManager, supabase } = await ctx();

  const { data: acct } = await supabase.from("whatsapp_accounts").select("connection_status,auto_reply_allowed,approval_required").eq("organization_id", orgId).maybeSingle();
  const a = acct as { connection_status?: string; auto_reply_allowed?: boolean; approval_required?: boolean } | null;

  const { data: convData } = await supabase.from("whatsapp_conversations").select("id,contact_name,state,intent,lead_score,unread,missed_call_flag,last_message,assigned_agent_id,next_best_action,updated_at").eq("organization_id", orgId).neq("state", "closed").order("lead_score", { ascending: false }).limit(200);
  const conversations: ConversationSummary[] = ((convData ?? []) as Record<string, unknown>[]).map((c) => ({
    id: c.id as string, name: (c.contact_name as string) ?? null, state: c.state as string, intent: c.intent as string,
    lead_score: (c.lead_score as number) ?? 0, unread: Boolean(c.unread), missed_call: Boolean(c.missed_call_flag),
    last_message: (c.last_message as string) ?? null, agent_id: (c.assigned_agent_id as string) ?? null, next_best_action: (c.next_best_action as string) ?? null, updated_at: c.updated_at as string,
  }));

  const { data: drafts } = await supabase.from("whatsapp_drafts").select("id,conversation_id,body,risk_level,requires_approval,approval_status,send_status").eq("organization_id", orgId).eq("approval_status", "pending").order("created_at", { ascending: false }).limit(60);
  const pendingApprovals: DraftSummary[] = ((drafts ?? []) as Record<string, unknown>[]).map((d) => ({ id: d.id as string, conversation_id: (d.conversation_id as string) ?? null, body: d.body as string, risk_level: d.risk_level as string, requires_approval: Boolean(d.requires_approval), approval_status: d.approval_status as string, send_status: d.send_status as string }));

  const { data: calls } = await supabase.from("whatsapp_call_events").select("id,contact_name,recovery_status,occurred_at").eq("organization_id", orgId).eq("event_type", "missed").neq("recovery_status", "recovered").order("occurred_at", { ascending: false }).limit(40);
  const missedCalls = ((calls ?? []) as Record<string, unknown>[]).map((c) => ({ id: c.id as string, name: (c.contact_name as string) ?? null, recovery_status: c.recovery_status as string, occurred_at: c.occurred_at as string }));

  const { data: fu } = await supabase.from("whatsapp_followups").select("id,body,due_at,status").eq("organization_id", orgId).in("status", ["scheduled", "due"]).order("due_at", { ascending: true }).limit(40);
  const followupsDue = ((fu ?? []) as Record<string, unknown>[]).map((f) => ({ id: f.id as string, body: (f.body as string) ?? null, due_at: (f.due_at as string) ?? null, status: f.status as string }));

  const { data: camp } = await supabase.from("whatsapp_campaigns").select("id,name,goal,status,audience_size,sent_count,replied_count").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(40);
  const campaigns = ((camp ?? []) as Record<string, unknown>[]).map((c) => ({ id: c.id as string, name: c.name as string, goal: c.goal as string, status: c.status as string, audience_size: (c.audience_size as number) ?? 0, sent_count: (c.sent_count as number) ?? 0, replied_count: (c.replied_count as number) ?? 0 }));

  const { data: links } = await supabase.from("whatsapp_smart_links").select("id,slug,link_type,click_count,conversion_count").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(40);
  const smartLinks = ((links ?? []) as Record<string, unknown>[]).map((l) => ({ id: l.id as string, slug: l.slug as string, link_type: l.link_type as string, click_count: (l.click_count as number) ?? 0, conversion_count: (l.conversion_count as number) ?? 0 }));

  const { data: missionData } = await supabase.from("whatsapp_daily_missions").select("id,title,reason,recommended_action,priority").eq("organization_id", orgId).eq("status", "open").order("priority", { ascending: false }).limit(20);
  const missions = ((missionData ?? []) as Record<string, unknown>[]).map((m) => ({ id: m.id as string, title: m.title as string, reason: (m.reason as string) ?? null, recommended_action: (m.recommended_action as string) ?? null, priority: (m.priority as number) ?? 3 }));

  const kpis = {
    needsReply: conversations.filter((c) => c.state === "requires_reply").length,
    hotLeads: conversations.filter((c) => c.state === "hot_lead" || c.lead_score >= 75).length,
    missedCalls: missedCalls.length, pendingApprovals: pendingApprovals.length, followupsDue: followupsDue.length, openConversations: conversations.length,
  };

  return {
    connectionStatus: a?.connection_status ?? "not_configured", autoReplyAllowed: Boolean(a?.auto_reply_allowed), approvalRequired: a?.approval_required ?? true,
    conversations, pendingApprovals, missedCalls, followupsDue, campaigns, smartLinks, segments: SEGMENTS, missions, kpis, isManager,
  };
}

// ── COMPLIANT connection (status only — never tokens) ─────────────────────────
export async function connectWhatsapp(): Promise<{ status: string }> {
  const { orgId, userId, supabase } = await ctx();
  try {
    const { data: existing } = await supabase.from("whatsapp_accounts").select("id").eq("organization_id", orgId).eq("provider", "whatsapp_cloud").maybeSingle();
    if (existing) await supabase.from("whatsapp_accounts").update({ connection_status: "sandbox", last_checked_at: new Date().toISOString() }).eq("id", (existing as { id: string }).id);
    else await supabase.from("whatsapp_accounts").insert({ organization_id: orgId, provider: "whatsapp_cloud", connection_status: "sandbox", approval_required: true });
  } catch { /* degrade */ }
  await audit(supabase, orgId, userId, "connect", "מצב ארגז חול — אין אינטגרציית Meta API פעילה. ללא שמירת אסימון.", "safe");
  return { status: "sandbox" };
}

// ── inbound capture (manual) + qualification + action extraction ──────────────
export async function recordInbound(input: { text: string; contactName?: string; conversationId?: string }): Promise<{ conversationId: string; intent: string }> {
  const { orgId, userId, supabase } = await ctx();
  const { intent, score } = detectIntent(input.text);
  let convId = input.conversationId ?? null;
  if (!convId) {
    const { data } = await supabase.from("whatsapp_conversations").insert({ organization_id: orgId, contact_name: input.contactName ?? null, assigned_agent_id: userId, intent, state: "requires_reply" }).select("id").single();
    convId = (data as { id: string } | null)?.id ?? null;
  }
  if (!convId) throw new Error("יצירת שיחה נכשלה");

  await supabase.from("whatsapp_messages").insert({ organization_id: orgId, conversation_id: convId, direction: "inbound", source: "manual", body: input.text, intent });

  // qualify from accumulated messages
  const { count } = await supabase.from("whatsapp_messages").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("conversation_id", convId);
  const q = qualify({ intent: intent as WaIntent, messageCount: count ?? 1, hasBudget: /(תקציב|עד \d|מיליון|₪)/.test(input.text), hasArea: /(רחוב|שכונ|עיר|אזור)/.test(input.text), hasTimeline: /(מיד|דחוף|חודש|שבוע|מתי)/.test(input.text), urgentWords: /(דחוף|מיד|היום|עכשיו)/.test(input.text) });
  await supabase.from("whatsapp_conversations").update({ last_message: input.text, last_message_at: new Date().toISOString(), intent, lead_score: q.leadQuality, urgency_score: q.urgency, unread: true, state: q.leadQuality >= 75 ? "hot_lead" : "requires_reply", next_best_action: q.stage === "hot" ? "צור קשר מיידי" : "המשך הסמכה" }).eq("organization_id", orgId).eq("id", convId);

  // extracted actions → ai_actions (suggestions only)
  const actions = extractActions(input.text);
  if (actions.length) await supabase.from("whatsapp_ai_actions").insert(actions.map((act) => ({ organization_id: orgId, conversation_id: convId, action_type: act.action_type, title: act.title, requires_approval: act.requires_approval, status: "suggested" })));

  await audit(supabase, orgId, userId, "inbound_recorded", `כוונה: ${intent}, ציון ${q.leadQuality}`, "safe", convId);
  return { conversationId: convId, intent };
}

// ── drafts + approval + manual send ────────────────────────────────────────────
export async function createDraft(input: { conversationId?: string; body: string; kind?: string }): Promise<{ id: string; requiresApproval: boolean }> {
  const { orgId, userId, supabase } = await ctx();
  const { risk, requiresApproval } = classifyRisk(input.body);
  const { data, error } = await supabase.from("whatsapp_drafts").insert({
    organization_id: orgId, conversation_id: input.conversationId ?? null, created_by: userId, body: input.body, kind: input.kind ?? "reply",
    risk_level: risk, requires_approval: requiresApproval, approval_status: requiresApproval ? "pending" : "none", send_status: "draft",
  }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "יצירת הטיוטה נכשלה");
  await audit(supabase, orgId, userId, "draft_created", `סיכון: ${risk}`, risk, input.conversationId);
  return { id: (data as { id: string }).id, requiresApproval };
}

export async function approveDraft(draftId: string): Promise<void> {
  const { orgId, userId, isManager, supabase } = await ctx();
  const { data: d } = await supabase.from("whatsapp_drafts").select("risk_level").eq("organization_id", orgId).eq("id", draftId).maybeSingle();
  const risk = (d as { risk_level?: string } | null)?.risk_level;
  if (risk === "sensitive" && !isManager) throw new Error("הודעה רגישה — דורשת אישור מנהל");
  await supabase.from("whatsapp_drafts").update({ approval_status: "approved", approved_by: userId, approved_at: new Date().toISOString() }).eq("organization_id", orgId).eq("id", draftId);
  await audit(supabase, orgId, userId, "draft_approved", null, risk ?? undefined);
}
export async function rejectDraft(draftId: string): Promise<void> {
  const { orgId, userId, supabase } = await ctx();
  await supabase.from("whatsapp_drafts").update({ approval_status: "rejected", send_status: "cancelled" }).eq("organization_id", orgId).eq("id", draftId);
  await audit(supabase, orgId, userId, "draft_rejected");
}
export async function markDraftSent(draftId: string): Promise<{ via: string }> {
  const { orgId, userId, supabase } = await ctx();
  const { data: d } = await supabase.from("whatsapp_drafts").select("requires_approval,approval_status").eq("organization_id", orgId).eq("id", draftId).maybeSingle();
  const row = d as { requires_approval?: boolean; approval_status?: string } | null;
  if (row?.requires_approval && row.approval_status !== "approved") throw new Error("ההודעה דורשת אישור לפני שליחה");
  // No official API send wired → mark as manually sent. (sent_api only when configured + allowed.)
  await supabase.from("whatsapp_drafts").update({ send_status: "sent_manual", sent_at: new Date().toISOString() }).eq("organization_id", orgId).eq("id", draftId);
  await audit(supabase, orgId, userId, "draft_sent_manual", "סומן כנשלח ידנית (אין שליחה אוטומטית)");
  return { via: "manual" };
}

// ── missed-call recovery ──────────────────────────────────────────────────────
export async function recordMissedCall(input: { contactName?: string }): Promise<{ id: string }> {
  const { orgId, userId, supabase } = await ctx();
  const { data: conv } = await supabase.from("whatsapp_conversations").insert({ organization_id: orgId, contact_name: input.contactName ?? null, assigned_agent_id: userId, state: "missed_call_recovery", missed_call_flag: true }).select("id").single();
  const convId = (conv as { id: string } | null)?.id ?? null;
  const { data, error } = await supabase.from("whatsapp_call_events").insert({ organization_id: orgId, conversation_id: convId, contact_name: input.contactName ?? null, event_type: "missed", recovery_status: "drafted", agent_id: userId }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "רישום השיחה נכשל");
  if (convId) await supabase.from("whatsapp_drafts").insert({ organization_id: orgId, conversation_id: convId, created_by: userId, body: missedCallDraft(input.contactName ?? null), kind: "missed_call_recovery", risk_level: "safe", approval_status: "none", send_status: "draft" });
  await audit(supabase, orgId, userId, "missed_call_recorded", null, "safe", convId ?? undefined);
  return { id: (data as { id: string }).id };
}

// ── follow-ups / campaigns / smart links ──────────────────────────────────────
export async function createFollowup(input: { conversationId?: string; body: string; followupType?: string; mode?: string; dueAt?: string }): Promise<void> {
  const { orgId, supabase } = await ctx();
  await supabase.from("whatsapp_followups").insert({ organization_id: orgId, conversation_id: input.conversationId ?? null, body: input.body, followup_type: input.followupType ?? "time_based", mode: input.mode ?? "draft", due_at: input.dueAt ?? null, status: "scheduled" });
}
export async function createCampaign(input: { name: string; goal: string; template?: string }): Promise<{ id: string }> {
  const { orgId, userId, isManager, supabase } = await ctx();
  if (!isManager) throw new Error("רק מנהל יכול ליצור קמפיין");
  const { data, error } = await supabase.from("whatsapp_campaigns").insert({ organization_id: orgId, name: input.name, goal: input.goal, message_template: input.template ?? null, status: "draft", created_by: userId }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "יצירת הקמפיין נכשלה");
  return { id: (data as { id: string }).id };
}
export async function createSmartLink(input: { linkType: string; title?: string; propertyId?: string }): Promise<{ slug: string }> {
  const { orgId, userId, supabase } = await ctx();
  const slug = randomBytes(6).toString("base64url");
  await supabase.from("whatsapp_smart_links").insert({ organization_id: orgId, slug, link_type: input.linkType, title: input.title ?? null, property_id: input.propertyId ?? null, created_by: userId });
  return { slug };
}

// ── public smart-link resolution (service-role; read-only, no PII) ─────────────
export async function resolveSmartLink(slug: string): Promise<{ title: string | null; link_type: string } | null> {
  const admin = createServiceRoleClient();
  const { data } = await admin.from("whatsapp_smart_links").select("id,title,link_type,click_count,organization_id").eq("slug", slug).eq("is_active", true).maybeSingle();
  if (!data) return null;
  const row = data as { id: string; title: string | null; link_type: string; click_count: number; organization_id: string };
  try {
    await admin.from("whatsapp_smart_links").update({ click_count: (row.click_count ?? 0) + 1 }).eq("id", row.id);
    await admin.from("whatsapp_smart_link_events").insert({ organization_id: row.organization_id, smart_link_id: row.id, event_type: "click" });
  } catch { /* best-effort */ }
  return { title: row.title, link_type: row.link_type };
}

// ── daily missions (derive from hot conversations + due followups + approvals) ─
export async function computeDailyMissions(): Promise<{ created: number }> {
  const { orgId, userId, supabase } = await ctx();
  await supabase.from("whatsapp_daily_missions").delete().eq("organization_id", orgId).eq("mission_date", new Date().toISOString().slice(0, 10)).eq("status", "open");
  const missions: { organization_id: string; agent_id: string; title: string; reason: string; recommended_action: string; priority: number; conversation_id: string | null; status: string }[] = [];
  const { data: hot } = await supabase.from("whatsapp_conversations").select("id,contact_name").eq("organization_id", orgId).gte("lead_score", 75).neq("state", "closed").limit(5);
  for (const c of (hot ?? []) as { id: string; contact_name: string | null }[]) missions.push({ organization_id: orgId, agent_id: userId, title: `צור קשר עם ליד חם — ${c.contact_name ?? "לקוח"}`, reason: "ציון ליד גבוה בשיחת וואטסאפ", recommended_action: "התקשר או השב היום", priority: 5, conversation_id: c.id, status: "open" });
  const { count: appr } = await supabase.from("whatsapp_drafts").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("approval_status", "pending");
  if ((appr ?? 0) > 0) missions.push({ organization_id: orgId, agent_id: userId, title: `${appr} הודעות ממתינות לאישור`, reason: "טיוטות רגישות ממתינות", recommended_action: "אשר או דחה במרכז האישורים", priority: 4, conversation_id: null, status: "open" });
  if (missions.length) await supabase.from("whatsapp_daily_missions").insert(missions);
  return { created: missions.length };
}

// ── coverage matrix (86 features) ───────────────────────────────────────────────
export async function getCoverage() { return { features: COVERAGE, stats: coverageStats() }; }

export type { Json };
