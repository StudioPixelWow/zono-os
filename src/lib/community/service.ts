// ============================================================================
// ZONO — Community Discovery & Execution OS · Service (server-only)
// ----------------------------------------------------------------------------
// Builds the /communities command center on top of EXISTING data (community_
// profiles, community_metrics, lead/deal attribution, social_accounts) plus the
// new execution tables (community_comments, messenger_threads). Records manual
// comment/Messenger leads with intent detection, and connects social accounts
// COMPLIANTLY (status only — never a token; graceful manual fallback).
// ============================================================================
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { detectIntent, isHotIntent } from "./engine";

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  let isManager = false;
  try { const { data } = await supabase.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { /* default agent */ }
  return { userId: user.id, orgId: profile.org_id, isManager, supabase };
}

// ── DTOs ─────────────────────────────────────────────────────────────────────
export interface CommunitySummary {
  id: string; name: string; platform: string | null; city: string | null; audience_type: string | null;
  members: number; lead_score: number; deal_score: number; roi_score: number; trust_score: number; status: string;
  leads_attributed: number; deals_attributed: number;
}
export interface CommentSummary { id: string; author: string | null; text: string | null; intent: string; intent_score: number; status: string; lead_created: boolean; community_id: string | null; created_at: string }
export interface MessengerSummary { id: string; contact: string | null; last_message: string | null; intent: string; status: string; created_at: string }
export interface SocialAccountSummary { id: string; provider: string; connection_status: string; last_sync_at: string | null }
export interface CommunityCommandCenter {
  communities: CommunitySummary[]; comments: CommentSummary[]; messenger: MessengerSummary[]; socialAccounts: SocialAccountSummary[];
  totalCommunities: number; approvedCommunities: number; leadsAttributed: number; dealsAttributed: number;
  hotComments: number; topRoi: CommunitySummary | null; lowRoi: CommunitySummary | null; isManager: boolean;
}

export async function getCommunityCommandCenter(): Promise<CommunityCommandCenter> {
  const { orgId, isManager, supabase } = await ctx();

  const { data: cp } = await supabase.from("community_profiles").select("id,name,platform,city,audience_type,members_count,lead_score,deal_score,roi_score,trust_score,status").eq("organization_id", orgId).order("roi_score", { ascending: false, nullsFirst: false }).limit(200);
  const rows = (cp ?? []) as Record<string, unknown>[];
  const ids = rows.map((c) => c.id as string);

  // attribution counts (guarded — tables exist from Distribution OS)
  const leadByComm = new Map<string, number>(); const dealByComm = new Map<string, number>();
  try { const { data } = await supabase.from("community_lead_attribution").select("community_id").eq("organization_id", orgId); for (const r of (data ?? []) as { community_id: string | null }[]) if (r.community_id) leadByComm.set(r.community_id, (leadByComm.get(r.community_id) ?? 0) + 1); } catch { /* optional */ }
  try { const { data } = await supabase.from("community_deal_attribution").select("community_id").eq("organization_id", orgId); for (const r of (data ?? []) as { community_id: string | null }[]) if (r.community_id) dealByComm.set(r.community_id, (dealByComm.get(r.community_id) ?? 0) + 1); } catch { /* optional */ }

  const communities: CommunitySummary[] = rows.map((c) => ({
    id: c.id as string, name: (c.name as string) ?? "קהילה", platform: (c.platform as string) ?? null, city: (c.city as string) ?? null,
    audience_type: (c.audience_type as string) ?? null, members: (c.members_count as number) ?? 0, lead_score: (c.lead_score as number) ?? 0,
    deal_score: (c.deal_score as number) ?? 0, roi_score: (c.roi_score as number) ?? 0, trust_score: (c.trust_score as number) ?? 0,
    status: (c.status as string) ?? "active", leads_attributed: leadByComm.get(c.id as string) ?? 0, deals_attributed: dealByComm.get(c.id as string) ?? 0,
  }));

  const { data: cc } = await supabase.from("community_comments").select("id,author_name,comment_text,intent,intent_score,status,lead_created,community_id,created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(60);
  const comments: CommentSummary[] = ((cc ?? []) as Record<string, unknown>[]).map((c) => ({
    id: c.id as string, author: (c.author_name as string) ?? null, text: (c.comment_text as string) ?? null, intent: c.intent as string,
    intent_score: (c.intent_score as number) ?? 0, status: c.status as string, lead_created: Boolean(c.lead_created), community_id: (c.community_id as string) ?? null, created_at: c.created_at as string,
  }));

  const { data: mt } = await supabase.from("messenger_threads").select("id,contact_name,last_message,intent,status,created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(40);
  const messenger: MessengerSummary[] = ((mt ?? []) as Record<string, unknown>[]).map((m) => ({
    id: m.id as string, contact: (m.contact_name as string) ?? null, last_message: (m.last_message as string) ?? null, intent: m.intent as string, status: m.status as string, created_at: m.created_at as string,
  }));

  let socialAccounts: SocialAccountSummary[] = [];
  try { const { data } = await supabase.from("social_accounts").select("id,provider,connection_status,last_sync_at").eq("organization_id", orgId); socialAccounts = ((data ?? []) as Record<string, unknown>[]).map((a) => ({ id: a.id as string, provider: (a.provider as string) ?? "facebook", connection_status: (a.connection_status as string) ?? "manual", last_sync_at: (a.last_sync_at as string) ?? null })); } catch { /* optional */ }

  const approvedCommunities = communities.filter((c) => c.status === "approved" || c.status === "active").length;
  const leadsAttributed = communities.reduce((s, c) => s + c.leads_attributed, 0);
  const dealsAttributed = communities.reduce((s, c) => s + c.deals_attributed, 0);
  const hotComments = comments.filter((c) => isHotIntent(c.intent) && c.status === "new").length;
  const ranked = [...communities].sort((a, b) => b.roi_score - a.roi_score);

  return {
    communities, comments, messenger, socialAccounts,
    totalCommunities: communities.length, approvedCommunities, leadsAttributed, dealsAttributed, hotComments,
    topRoi: ranked[0] ?? null, lowRoi: ranked.length > 1 ? ranked[ranked.length - 1] : null, isManager,
  };
}

// ── manual comment / messenger capture (with intent detection) ────────────────
export async function recordComment(input: { text: string; author?: string; communityId?: string; propertyId?: string }): Promise<{ id: string; intent: string }> {
  const { orgId, userId, supabase } = await ctx();
  const { intent, score } = detectIntent(input.text);
  const { data, error } = await supabase.from("community_comments").insert({
    organization_id: orgId, agent_id: userId, community_id: input.communityId ?? null, property_id: input.propertyId ?? null,
    author_name: input.author ?? null, comment_text: input.text, intent, intent_score: score, source: "manual", status: "new",
  }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "רישום התגובה נכשל");
  return { id: (data as { id: string }).id, intent };
}

export async function recordMessengerThread(input: { lastMessage: string; contact?: string; communityId?: string }): Promise<{ id: string; intent: string }> {
  const { orgId, userId, supabase } = await ctx();
  const { intent, score } = detectIntent(input.lastMessage);
  const { data, error } = await supabase.from("messenger_threads").insert({
    organization_id: orgId, agent_id: userId, community_id: input.communityId ?? null, contact_name: input.contact ?? null,
    last_message: input.lastMessage, intent, intent_score: score, source: "manual", status: "new",
  }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "רישום השיחה נכשל");
  return { id: (data as { id: string }).id, intent };
}

export async function markCommentConverted(commentId: string): Promise<void> {
  const { orgId, supabase } = await ctx();
  await supabase.from("community_comments").update({ status: "converted", lead_created: true }).eq("organization_id", orgId).eq("id", commentId);
}

// ── COMPLIANT social-account connection (status only — never a token) ─────────
export async function connectSocialAccount(provider: string): Promise<{ status: string }> {
  const { orgId, userId, supabase } = await ctx();
  // No OAuth app configured → graceful manual fallback. We store ONLY connection
  // status + metadata; never credentials/tokens (compliance). Meta-API-ready.
  let id: string | null = null;
  try {
    const { data: existing } = await supabase.from("social_accounts").select("id").eq("organization_id", orgId).eq("provider", provider).maybeSingle();
    id = (existing as { id: string } | null)?.id ?? null;
    if (id) await supabase.from("social_accounts").update({ connection_status: "manual", last_sync_at: new Date().toISOString() }).eq("id", id);
    else { const { data } = await supabase.from("social_accounts").insert({ organization_id: orgId, user_id: userId, provider, connection_status: "manual", last_sync_at: new Date().toISOString() }).select("id").single(); id = (data as { id: string } | null)?.id ?? null; }
  } catch { /* table shape may differ — degrade gracefully */ }
  try { await supabase.from("social_account_sync_logs").insert({ organization_id: orgId, social_account_id: id, event: "connect", status: "manual", detail: "חיבור ידני — אין אינטגרציית Meta API פעילה. ללא שמירת אסימון." }); } catch { /* optional */ }
  return { status: "manual" };
}
