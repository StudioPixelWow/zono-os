// ============================================================================
// ZONO — Distribution repository (server-only). REAL Supabase queries for the
// 9 distribution_* tables. Every read/write is org-scoped (RLS enforces it; we
// also stamp org_id on inserts). The distribution_* tables are not in the
// generated Database type yet, so queries cast through `as never` and results
// are shaped with the row types in db-types.ts. NO mock data, ever.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import {
  DIST,
  type DistGroupRow, type DistCampaignRow, type DistCampaignGroupRow, type DistVariationRow,
  type DistPostRow, type DistCommentRow, type DistLeadRow, type DistAnalyticsRow, type DistAutomationRow,
  type DistGroupStatus, type DistCampaignStatus, type DistLeadStatus,
} from "./db-types";

type DB = Awaited<ReturnType<typeof createClient>>;

/** Resolve the authenticated org + user. Returns null when unauthenticated. */
async function scope(): Promise<{ db: DB; orgId: string; userId: string | null } | null> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) return null;
  const db = await createClient();
  return { db, orgId: profile.org_id, userId: profile.id ?? null };
}

const list = <T>(data: unknown): T[] => (data ?? []) as T[];

// ── Groups ───────────────────────────────────────────────────────────────────
export const distributionRepo = {
  async listGroups(opts: { status?: DistGroupStatus; city?: string; limit?: number } = {}): Promise<DistGroupRow[]> {
    const s = await scope(); if (!s) return [];
    let q = s.db.from(DIST.groups as never).select("*").eq("org_id", s.orgId);
    if (opts.status) q = q.eq("status", opts.status);
    if (opts.city) q = q.eq("city", opts.city);
    const { data } = await q.order("performance_score", { ascending: false }).limit(opts.limit ?? 200);
    return list<DistGroupRow>(data);
  },
  async createGroup(input: { name: string; url?: string | null; platform?: string; category?: string | null; city?: string | null; area?: string | null; membersCount?: number; status?: DistGroupStatus }): Promise<DistGroupRow | null> {
    const s = await scope(); if (!s) return null;
    const { data, error } = await s.db.from(DIST.groups as never).insert({
      org_id: s.orgId, name: input.name, group_url: input.url ?? null, platform: input.platform ?? "facebook",
      category: input.category ?? null, city: input.city ?? null, locality: input.area ?? null,
      members_count: input.membersCount ?? 0, status: input.status ?? "active", created_by: s.userId,
    } as never).select("*").single();
    if (error) { console.error("[distribution.repo] createGroup:", error.message); return null; }
    return data as unknown as DistGroupRow;
  },
  async updateGroup(id: string, patch: Partial<{ name: string; url: string | null; category: string | null; city: string | null; area: string | null; membersCount: number; status: DistGroupStatus; performanceScore: number }>): Promise<boolean> {
    const s = await scope(); if (!s) return false;
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.url !== undefined) row.group_url = patch.url;
    if (patch.category !== undefined) row.category = patch.category;
    if (patch.city !== undefined) row.city = patch.city;
    if (patch.area !== undefined) row.locality = patch.area;
    if (patch.membersCount !== undefined) row.members_count = patch.membersCount;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.performanceScore !== undefined) row.performance_score = patch.performanceScore;
    const { error } = await s.db.from(DIST.groups as never).update(row as never).eq("id", id).eq("org_id", s.orgId);
    return !error;
  },
  async deleteGroup(id: string): Promise<boolean> {
    const s = await scope(); if (!s) return false;
    const { error } = await s.db.from(DIST.groups as never).delete().eq("id", id).eq("org_id", s.orgId);
    return !error;
  },

  // ── Campaigns ────────────────────────────────────────────────────────────
  async listCampaigns(opts: { status?: DistCampaignStatus; limit?: number } = {}): Promise<DistCampaignRow[]> {
    const s = await scope(); if (!s) return [];
    let q = s.db.from(DIST.campaigns as never).select("*").eq("org_id", s.orgId);
    if (opts.status) q = q.eq("status", opts.status);
    const { data } = await q.order("created_at", { ascending: false }).limit(opts.limit ?? 100);
    return list<DistCampaignRow>(data);
  },
  async getCampaign(id: string): Promise<DistCampaignRow | null> {
    const s = await scope(); if (!s) return null;
    const { data } = await s.db.from(DIST.campaigns as never).select("*").eq("id", id).eq("org_id", s.orgId).maybeSingle();
    return (data as unknown as DistCampaignRow) ?? null;
  },
  /** Create a campaign. Spec names map: targetCity→cities[0], targetAudience→audience, campaignGoal→objective. */
  async createCampaign(input: { name: string; propertyId?: string | null; targetCity?: string | null; targetAudience?: string | null; campaignGoal?: string | null; status?: DistCampaignStatus }): Promise<DistCampaignRow | null> {
    const s = await scope(); if (!s) return null;
    const { data, error } = await s.db.from(DIST.campaigns as never).insert({
      org_id: s.orgId, name: input.name, property_id: input.propertyId ?? null,
      cities: input.targetCity ? [input.targetCity] : [], audience: input.targetAudience ?? null,
      objective: input.campaignGoal ?? null, status: input.status ?? "draft", created_by: s.userId,
    } as never).select("*").single();
    if (error) { console.error("[distribution.repo] createCampaign:", error.message); return null; }
    return data as unknown as DistCampaignRow;
  },
  async updateCampaign(id: string, patch: Partial<{ name: string; status: DistCampaignStatus; targetCity: string | null; targetAudience: string | null; campaignGoal: string | null; startedAt: string | null; endedAt: string | null }>): Promise<boolean> {
    const s = await scope(); if (!s) return false;
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.targetCity !== undefined) row.cities = patch.targetCity ? [patch.targetCity] : [];
    if (patch.targetAudience !== undefined) row.audience = patch.targetAudience;
    if (patch.campaignGoal !== undefined) row.objective = patch.campaignGoal;
    if (patch.startedAt !== undefined) row.starts_at = patch.startedAt;
    if (patch.endedAt !== undefined) row.ends_at = patch.endedAt;
    const { error } = await s.db.from(DIST.campaigns as never).update(row as never).eq("id", id).eq("org_id", s.orgId);
    return !error;
  },
  async deleteCampaign(id: string): Promise<boolean> {
    const s = await scope(); if (!s) return false;
    const { error } = await s.db.from(DIST.campaigns as never).delete().eq("id", id).eq("org_id", s.orgId);
    return !error;
  },

  // ── Campaign ↔ Group selection ─────────────────────────────────────────────
  async listCampaignGroups(campaignId: string): Promise<DistCampaignGroupRow[]> {
    const s = await scope(); if (!s) return [];
    const { data } = await s.db.from(DIST.campaignGroups as never).select("*").eq("org_id", s.orgId).eq("campaign_id", campaignId);
    return list<DistCampaignGroupRow>(data);
  },
  /** Replace the campaign's selected groups with `groupIds` (idempotent upsert). */
  async selectGroups(campaignId: string, groupIds: string[]): Promise<number> {
    const s = await scope(); if (!s) return 0;
    if (!groupIds.length) return 0;
    const rows = groupIds.map((gid, i) => ({
      org_id: s.orgId, campaign_id: campaignId, group_id: gid, status: "selected",
      recommended_order: i + 1, selected_at: new Date().toISOString(),
    }));
    const { error, data } = await s.db.from(DIST.campaignGroups as never)
      .upsert(rows as never, { onConflict: "campaign_id,group_id" }).select("id");
    if (error) { console.error("[distribution.repo] selectGroups:", error.message); return 0; }
    await s.db.from(DIST.campaigns as never).update({ total_groups: groupIds.length } as never).eq("id", campaignId).eq("org_id", s.orgId);
    return list<unknown>(data).length;
  },
  async removeCampaignGroup(campaignId: string, groupId: string): Promise<boolean> {
    const s = await scope(); if (!s) return false;
    const { error } = await s.db.from(DIST.campaignGroups as never).delete().eq("org_id", s.orgId).eq("campaign_id", campaignId).eq("group_id", groupId);
    return !error;
  },

  // ── Variations / Posts / Comments ──────────────────────────────────────────
  async listVariations(campaignId: string): Promise<DistVariationRow[]> {
    const s = await scope(); if (!s) return [];
    const { data } = await s.db.from(DIST.variations as never).select("*").eq("org_id", s.orgId).eq("campaign_id", campaignId).order("wow_score", { ascending: false });
    return list<DistVariationRow>(data);
  },
  async listPosts(opts: { campaignId?: string; status?: string; limit?: number } = {}): Promise<DistPostRow[]> {
    const s = await scope(); if (!s) return [];
    let q = s.db.from(DIST.posts as never).select("*").eq("org_id", s.orgId);
    if (opts.campaignId) q = q.eq("campaign_id", opts.campaignId);
    if (opts.status) q = q.eq("status", opts.status);
    const { data } = await q.order("scheduled_at", { ascending: true, nullsFirst: false }).limit(opts.limit ?? 200);
    return list<DistPostRow>(data);
  },
  async listComments(opts: { postId?: string; limit?: number } = {}): Promise<DistCommentRow[]> {
    const s = await scope(); if (!s) return [];
    let q = s.db.from(DIST.comments as never).select("*").eq("org_id", s.orgId);
    if (opts.postId) q = q.eq("post_id", opts.postId);
    const { data } = await q.order("occurred_at", { ascending: false }).limit(opts.limit ?? 200);
    return list<DistCommentRow>(data);
  },

  // ── Leads ──────────────────────────────────────────────────────────────────
  async listLeads(opts: { status?: DistLeadStatus; limit?: number } = {}): Promise<DistLeadRow[]> {
    const s = await scope(); if (!s) return [];
    let q = s.db.from(DIST.leads as never).select("*").eq("org_id", s.orgId);
    if (opts.status) q = q.eq("status", opts.status);
    const { data } = await q.order("created_at", { ascending: false }).limit(opts.limit ?? 200);
    return list<DistLeadRow>(data);
  },
  async createLead(input: { name?: string | null; phone?: string | null; source?: string; campaignId?: string | null; postId?: string | null; commentId?: string | null; propertyId?: string | null; intentScore?: number; notes?: string | null }): Promise<DistLeadRow | null> {
    const s = await scope(); if (!s) return null;
    const { data, error } = await s.db.from(DIST.leads as never).insert({
      org_id: s.orgId, name: input.name ?? null, phone: input.phone ?? null, source: input.source ?? "manual",
      campaign_id: input.campaignId ?? null, post_id: input.postId ?? null, comment_id: input.commentId ?? null,
      property_id: input.propertyId ?? null, intent_score: input.intentScore ?? 0, notes: input.notes ?? null, status: "new",
    } as never).select("*").single();
    if (error) { console.error("[distribution.repo] createLead:", error.message); return null; }
    return data as unknown as DistLeadRow;
  },
  async updateLead(id: string, patch: Partial<{ status: DistLeadStatus; notes: string | null; phone: string | null; name: string | null; metadata: Record<string, unknown> }>): Promise<boolean> {
    const s = await scope(); if (!s) return false;
    const { error } = await s.db.from(DIST.leads as never).update(patch as never).eq("id", id).eq("org_id", s.orgId);
    return !error;
  },
  async getLeadById(id: string): Promise<DistLeadRow | null> {
    const s = await scope(); if (!s) return null;
    const { data } = await s.db.from(DIST.leads as never).select("*").eq("id", id).eq("org_id", s.orgId).limit(1).maybeSingle();
    return (data as unknown as DistLeadRow) ?? null;
  },
  /** Find the distribution_lead that a CRM lead was promoted from (metadata.crm_lead_id). */
  async getLeadByCrmLeadId(crmLeadId: string): Promise<DistLeadRow | null> {
    const s = await scope(); if (!s) return null;
    const { data } = await s.db.from(DIST.leads as never).select("*").eq("org_id", s.orgId)
      .eq("metadata->>crm_lead_id", crmLeadId).limit(1).maybeSingle();
    return (data as unknown as DistLeadRow) ?? null;
  },

  // ── Analytics ──────────────────────────────────────────────────────────────
  async listAnalytics(opts: { campaignId?: string; limit?: number } = {}): Promise<DistAnalyticsRow[]> {
    const s = await scope(); if (!s) return [];
    let q = s.db.from(DIST.analytics as never).select("*").eq("org_id", s.orgId);
    if (opts.campaignId) q = q.eq("campaign_id", opts.campaignId);
    const { data } = await q.order("period_date", { ascending: false }).limit(opts.limit ?? 90);
    return list<DistAnalyticsRow>(data);
  },

  // ── Automations ────────────────────────────────────────────────────────────
  async listAutomations(): Promise<DistAutomationRow[]> {
    const s = await scope(); if (!s) return [];
    const { data } = await s.db.from(DIST.automations as never).select("*").eq("org_id", s.orgId).order("created_at", { ascending: false });
    return list<DistAutomationRow>(data);
  },
  async createAutomation(input: { name: string; automationType: string; campaignId?: string | null; config?: Record<string, unknown> }): Promise<DistAutomationRow | null> {
    const s = await scope(); if (!s) return null;
    const { data, error } = await s.db.from(DIST.automations as never).insert({
      org_id: s.orgId, name: input.name, automation_type: input.automationType, campaign_id: input.campaignId ?? null,
      config_json: input.config ?? {}, status: "draft", is_enabled: false, created_by: s.userId,
    } as never).select("*").single();
    if (error) { console.error("[distribution.repo] createAutomation:", error.message); return null; }
    return data as unknown as DistAutomationRow;
  },
  async toggleAutomation(id: string, enabled: boolean): Promise<boolean> {
    const s = await scope(); if (!s) return false;
    const { error } = await s.db.from(DIST.automations as never)
      .update({ is_enabled: enabled, status: enabled ? "active" : "paused" } as never).eq("id", id).eq("org_id", s.orgId);
    return !error;
  },

  // ── Aggregate stats (every dashboard number comes from here) ────────────────
  async centerStats(): Promise<{
    groups: number; activeGroups: number; campaigns: number; activeCampaigns: number;
    posts: number; publishedPosts: number; scheduledPosts: number; leads: number; newLeads: number;
    impressions: number; clicks: number; comments: number; conversionRate: number;
  }> {
    const s = await scope();
    const empty = { groups: 0, activeGroups: 0, campaigns: 0, activeCampaigns: 0, posts: 0, publishedPosts: 0, scheduledPosts: 0, leads: 0, newLeads: 0, impressions: 0, clicks: 0, comments: 0, conversionRate: 0 };
    if (!s) return empty;
    const [groups, campaigns, posts, leads, analytics, comments] = await Promise.all([
      s.db.from(DIST.groups as never).select("status").eq("org_id", s.orgId),
      s.db.from(DIST.campaigns as never).select("status").eq("org_id", s.orgId),
      s.db.from(DIST.posts as never).select("status").eq("org_id", s.orgId),
      s.db.from(DIST.leads as never).select("status").eq("org_id", s.orgId),
      s.db.from(DIST.analytics as never).select("impressions, clicks").eq("org_id", s.orgId),
      s.db.from(DIST.comments as never).select("id", { count: "exact", head: true }).eq("org_id", s.orgId),
    ]);
    const g = list<{ status: string }>(groups.data);
    const c = list<{ status: string }>(campaigns.data);
    const p = list<{ status: string }>(posts.data);
    const l = list<{ status: string }>(leads.data);
    const a = list<{ impressions: number; clicks: number }>(analytics.data);
    const impressions = a.reduce((sum, r) => sum + (r.impressions ?? 0), 0);
    const clicks = a.reduce((sum, r) => sum + (r.clicks ?? 0), 0);
    return {
      groups: g.length, activeGroups: g.filter((x) => x.status === "active").length,
      campaigns: c.length, activeCampaigns: c.filter((x) => x.status === "active").length,
      posts: p.length, publishedPosts: p.filter((x) => x.status === "published").length,
      scheduledPosts: p.filter((x) => x.status === "scheduled" || x.status === "pending").length,
      leads: l.length, newLeads: l.filter((x) => x.status === "new").length,
      impressions, clicks, comments: (comments as { count?: number }).count ?? 0,
      conversionRate: impressions ? Math.round((l.length / impressions) * 10000) / 100 : 0,
    };
  },
};
