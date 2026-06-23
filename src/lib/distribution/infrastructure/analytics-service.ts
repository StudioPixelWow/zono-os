// ============================================================================
// ZONO — ANALYTICS service (server-only).
// ----------------------------------------------------------------------------
// Rolls raw distribution activity (posts, comments, leads) into per-day,
// per-(campaign,group) snapshots in distribution_analytics, and exposes read
// aggregates for dashboards. Recompute is idempotent via the table's unique
// (org, campaign, group, period_date) index. No external calls.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { TBL } from "./types";

type DB = Awaited<ReturnType<typeof createClient>>;
const today = () => new Date().toISOString().slice(0, 10);

interface PostAgg { campaign_id: string | null; group_id: string | null; status: string; reach: number | null; engagement: number | null; leads_count: number | null }

export interface DistributionOverview {
  posts: number; published: number; reach: number; engagement: number;
  comments: number; leads: number; successRate: number;
}

export const analyticsService = {
  /** Recompute today's analytics rows for an org from live post/comment/lead data.
   *  Aggregates by (campaign, group) and upserts one row per pair. */
  async recomputeDaily(orgId: string, periodDate = today(), db?: DB): Promise<number> {
    const sb = db ?? (await createClient());
    const [{ data: posts }, { data: comments }, { data: leads }] = await Promise.all([
      sb.from(TBL.posts as never).select("campaign_id, group_id, status, reach, engagement, leads_count").eq("org_id", orgId),
      sb.from(TBL.comments as never).select("post_id, group_id").eq("org_id", orgId),
      sb.from(TBL.leads as never).select("campaign_id, group_id").eq("org_id", orgId),
    ]);

    // Bucket posts by (campaign|group).
    const buckets = new Map<string, { campaign_id: string | null; group_id: string | null; posts: number; published: number; reach: number; engagement: number; leads: number; comments: number }>();
    const keyOf = (c: string | null, g: string | null) => `${c ?? ""}|${g ?? ""}`;
    for (const p of (posts ?? []) as PostAgg[]) {
      const k = keyOf(p.campaign_id, p.group_id);
      const b = buckets.get(k) ?? { campaign_id: p.campaign_id, group_id: p.group_id, posts: 0, published: 0, reach: 0, engagement: 0, leads: 0, comments: 0 };
      b.posts += 1;
      if (p.status === "published") b.published += 1;
      b.reach += p.reach ?? 0; b.engagement += p.engagement ?? 0; b.leads += p.leads_count ?? 0;
      buckets.set(k, b);
    }
    for (const l of (leads ?? []) as { campaign_id: string | null; group_id: string | null }[]) {
      const k = keyOf(l.campaign_id, l.group_id);
      const b = buckets.get(k); if (b) b.leads = Math.max(b.leads, b.leads); // leads already counted from posts; keep group-level lead rows too
    }
    // Comments only carry group_id → fold into the matching group buckets.
    const commentsByGroup = new Map<string, number>();
    for (const c of (comments ?? []) as { group_id: string | null }[]) {
      const g = c.group_id ?? ""; commentsByGroup.set(g, (commentsByGroup.get(g) ?? 0) + 1);
    }
    for (const b of buckets.values()) b.comments = commentsByGroup.get(b.group_id ?? "") ?? 0;

    const rows = Array.from(buckets.values()).map((b) => ({
      org_id: orgId, campaign_id: b.campaign_id, group_id: b.group_id, period_date: periodDate,
      posts_count: b.posts, reach: b.reach, engagement: b.engagement, comments_count: b.comments,
      leads_count: b.leads, success_rate: b.posts ? Math.round((b.published / b.posts) * 10000) / 100 : 0,
    }));
    if (!rows.length) return 0;
    const { error } = await sb.from(TBL.analytics as never)
      .upsert(rows as never, { onConflict: "org_id,campaign_id,group_id,period_date" });
    if (error) { console.error("[distribution.analytics] recompute failed:", error.message); return 0; }
    return rows.length;
  },

  /** Org-wide live overview straight from the posts/comments/leads tables. */
  async overview(orgId: string, db?: DB): Promise<DistributionOverview> {
    const sb = db ?? (await createClient());
    const [{ data: posts }, { count: commentCount }, { count: leadCount }] = await Promise.all([
      sb.from(TBL.posts as never).select("status, reach, engagement").eq("org_id", orgId),
      sb.from(TBL.comments as never).select("id", { count: "exact", head: true }).eq("org_id", orgId),
      sb.from(TBL.leads as never).select("id", { count: "exact", head: true }).eq("org_id", orgId),
    ]);
    const list = (posts ?? []) as { status: string; reach: number | null; engagement: number | null }[];
    const published = list.filter((p) => p.status === "published").length;
    return {
      posts: list.length, published,
      reach: list.reduce((s, p) => s + (p.reach ?? 0), 0),
      engagement: list.reduce((s, p) => s + (p.engagement ?? 0), 0),
      comments: commentCount ?? 0, leads: leadCount ?? 0,
      successRate: list.length ? Math.round((published / list.length) * 10000) / 100 : 0,
    };
  },
};
