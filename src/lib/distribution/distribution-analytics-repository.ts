// ============================================================================
// ZONO — Distribution ANALYTICS repository (server-only). Org-scoped raw reads
// of every dataset the analytics engine needs, plus persistence of the computed
// performance scores back onto the source tables. RLS enforces org isolation.
// No mock data — every row comes from Supabase.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import {
  DIST,
  type DistCampaignRow, type DistGroupRow, type DistPostRow,
  type DistVariationRow, type DistCommentRow, type DistLeadRow,
} from "./db-types";

type DB = Awaited<ReturnType<typeof createClient>>;
async function scope(): Promise<{ db: DB; orgId: string } | null> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) return null;
  return { db: await createClient(), orgId: profile.org_id };
}
const list = <T>(d: unknown): T[] => (d ?? []) as T[];

export interface AnalyticsDatasets {
  campaigns: DistCampaignRow[]; groups: DistGroupRow[]; posts: DistPostRow[];
  variations: DistVariationRow[]; comments: DistCommentRow[]; leads: DistLeadRow[];
}

export const distributionAnalyticsRepository = {
  /** Fetch every dataset the analytics engine needs in one org-scoped pass. */
  async fetchDatasets(): Promise<AnalyticsDatasets> {
    const empty: AnalyticsDatasets = { campaigns: [], groups: [], posts: [], variations: [], comments: [], leads: [] };
    const s = await scope(); if (!s) return empty;
    const sel = (t: string) => s.db.from(t as never).select("*").eq("org_id", s.orgId).limit(2000);
    const [campaigns, groups, posts, variations, comments, leads] = await Promise.all([
      sel(DIST.campaigns), sel(DIST.groups), sel(DIST.posts), sel(DIST.variations), sel(DIST.comments), sel(DIST.leads),
    ]);
    return {
      campaigns: list<DistCampaignRow>(campaigns.data), groups: list<DistGroupRow>(groups.data),
      posts: list<DistPostRow>(posts.data), variations: list<DistVariationRow>(variations.data),
      comments: list<DistCommentRow>(comments.data), leads: list<DistLeadRow>(leads.data),
    };
  },

  /** Persist computed group performance scores onto distribution_groups. */
  async persistGroupScores(scores: { id: string; score: number; leads: number }[]): Promise<number> {
    const s = await scope(); if (!s) return 0;
    let n = 0;
    for (const g of scores) {
      const { error } = await s.db.from(DIST.groups as never)
        .update({ performance_score: g.score, lead_score: Math.min(100, g.leads * 10) } as never)
        .eq("id", g.id).eq("org_id", s.orgId);
      if (!error) n++;
    }
    return n;
  },

  /** Persist campaign rollups onto distribution_campaigns (real counts + score). */
  async persistCampaignScores(rows: { id: string; score: number; published: number; leads: number; groupsUsed: number; successRate: number }[]): Promise<number> {
    const s = await scope(); if (!s) return 0;
    let n = 0;
    for (const c of rows) {
      const { error } = await s.db.from(DIST.campaigns as never).update({
        total_posts: c.published, total_leads: c.leads, total_groups: c.groupsUsed,
        success_rate: c.successRate, metadata: { performance_score: c.score },
      } as never).eq("id", c.id).eq("org_id", s.orgId);
      if (!error) n++;
    }
    return n;
  },

  /** Persist variation performance into distribution_variations.metadata (keeps AI scores intact). */
  async persistVariationScores(rows: { id: string; score: number; comments: number; leads: number; conversionRate: number; usedCount: number }[]): Promise<number> {
    const s = await scope(); if (!s) return 0;
    let n = 0;
    for (const v of rows) {
      const { error } = await s.db.from(DIST.variations as never).update({
        metadata: { performance_score: v.score, comments: v.comments, leads: v.leads, conversion_rate: v.conversionRate, used_count: v.usedCount },
      } as never).eq("id", v.id).eq("org_id", s.orgId);
      if (!error) n++;
    }
    return n;
  },
};
