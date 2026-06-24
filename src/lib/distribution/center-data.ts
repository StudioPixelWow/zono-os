// ============================================================================
// ZONO — Distribution Center data loader (server-only).
// ----------------------------------------------------------------------------
// Builds the real, org-scoped view-model the Distribution Center renders, 100%
// from Supabase via the repository. Spec field names (url, area, targetCity,
// targetAudience, campaignGoal, leadScore, …) are exposed here so the UI never
// touches raw column names. No mock data, no hardcoded counters.
// ============================================================================
import "server-only";
import { distributionRepo } from "./repository";

export interface CenterStats {
  groups: number; activeGroups: number; campaigns: number; activeCampaigns: number;
  posts: number; publishedPosts: number; scheduledPosts: number; leads: number; newLeads: number;
  impressions: number; clicks: number; comments: number; conversionRate: number;
}
export interface CenterGroup {
  id: string; name: string; url: string | null; platform: string | null; category: string | null;
  city: string | null; area: string | null; membersCount: number; status: string; performanceScore: number; lastPostAt: string | null;
}
export interface CenterCampaign {
  id: string; name: string; status: string; targetCity: string | null; targetAudience: string | null;
  campaignGoal: string | null; totalGroups: number; totalPosts: number; totalLeads: number; createdAt: string;
}
export interface CenterPost {
  id: string; status: string; postTitle: string | null; scheduledAt: string | null; publishedAt: string | null;
  failedReason: string | null; externalPostUrl: string | null; campaignId: string | null; groupId: string | null;
}
export interface CenterLead {
  id: string; name: string | null; phone: string | null; source: string; status: string; intentScore: number;
  notes: string | null; createdAt: string;
}
export interface CenterAnalytics {
  id: string; periodDate: string; impressions: number; clicks: number; commentsCount: number; leadsCount: number; conversionRate: number;
}
export interface CenterAutomation {
  id: string; name: string; automationType: string; status: string; isEnabled: boolean; lastRunAt: string | null; nextRunAt: string | null;
}

export interface DistributionCenterData {
  stats: CenterStats;
  groups: CenterGroup[];
  campaigns: CenterCampaign[];
  posts: CenterPost[];
  leads: CenterLead[];
  analytics: CenterAnalytics[];
  automations: CenterAutomation[];
}

/** Load the entire center in one org-scoped pass. Each list is independently
 *  error-isolated by the repository (returns [] on failure / no auth). */
export async function getDistributionCenter(): Promise<DistributionCenterData> {
  const [stats, groups, campaigns, posts, leads, analytics, automations] = await Promise.all([
    distributionRepo.centerStats(),
    distributionRepo.listGroups({ limit: 200 }),
    distributionRepo.listCampaigns({ limit: 100 }),
    distributionRepo.listPosts({ limit: 200 }),
    distributionRepo.listLeads({ limit: 200 }),
    distributionRepo.listAnalytics({ limit: 60 }),
    distributionRepo.listAutomations(),
  ]);

  return {
    stats,
    groups: groups.map((g) => ({
      id: g.id, name: g.name, url: g.group_url, platform: g.platform, category: g.category,
      city: g.city, area: g.locality, membersCount: g.members_count, status: g.status,
      performanceScore: g.performance_score, lastPostAt: g.last_post_at,
    })),
    campaigns: campaigns.map((c) => ({
      id: c.id, name: c.name, status: c.status, targetCity: c.cities?.[0] ?? null,
      targetAudience: c.audience, campaignGoal: c.objective, totalGroups: c.total_groups,
      totalPosts: c.total_posts, totalLeads: c.total_leads, createdAt: c.created_at,
    })),
    posts: posts.map((p) => ({
      id: p.id, status: p.status, postTitle: p.post_title, scheduledAt: p.scheduled_at,
      publishedAt: p.published_at, failedReason: p.failure_reason, externalPostUrl: p.external_post_url,
      campaignId: p.campaign_id, groupId: p.group_id,
    })),
    leads: leads.map((l) => ({
      id: l.id, name: l.name, phone: l.phone, source: l.source, status: l.status,
      intentScore: l.intent_score, notes: l.notes, createdAt: l.created_at,
    })),
    analytics: analytics.map((a) => ({
      id: a.id, periodDate: a.period_date, impressions: a.impressions, clicks: a.clicks,
      commentsCount: a.comments_count, leadsCount: a.leads_count, conversionRate: a.conversion_rate,
    })),
    automations: automations.map((a) => ({
      id: a.id, name: a.name, automationType: a.automation_type, status: a.status,
      isEnabled: a.is_enabled, lastRunAt: a.last_run_at, nextRunAt: a.next_run_at,
    })),
  };
}
