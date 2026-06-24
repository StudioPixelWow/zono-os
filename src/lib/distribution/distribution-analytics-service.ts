// ============================================================================
// ZONO — Distribution ANALYTICS service (server-only). Maps the real Supabase
// datasets into the pure analytics engine, returns the computed analytics, and
// (on recalc) persists the derived scores back onto the source tables. Nothing
// is invented — every metric is a function of stored records.
// ============================================================================
import "server-only";
import { distributionAnalyticsRepository } from "./distribution-analytics-repository";
import {
  computeAnalytics, type AnalyticsInput, type DistributionAnalytics, type Recommendation,
} from "./analytics-scoring";

function toInput(d: Awaited<ReturnType<typeof distributionAnalyticsRepository.fetchDatasets>>): AnalyticsInput {
  return {
    campaigns: d.campaigns.map((c) => ({ id: c.id, name: c.name, status: c.status })),
    groups: d.groups.map((g) => ({ id: g.id, name: g.name, city: g.city, members: g.members_count })),
    posts: d.posts.map((p) => ({ id: p.id, campaignId: p.campaign_id, groupId: p.group_id, variationId: p.variation_id, status: p.status, failureReason: p.failure_reason })),
    variations: d.variations.map((v) => ({ id: v.id, campaignId: v.campaign_id, angle: v.angle, cta: v.cta, headline: v.headline })),
    comments: d.comments.map((c) => ({ id: c.id, postId: c.post_id, groupId: c.group_id, category: c.category, sentiment: c.sentiment, leadIntentScore: c.lead_intent_score, isLead: c.is_lead, leadId: c.lead_id })),
    leads: d.leads.map((l) => ({ id: l.id, campaignId: l.campaign_id, postId: l.post_id, groupId: l.group_id, status: l.status, intentScore: l.intent_score })),
  };
}

export const distributionAnalyticsService = {
  /** The full analytics payload, computed from real records. */
  async get(): Promise<DistributionAnalytics> {
    const datasets = await distributionAnalyticsRepository.fetchDatasets();
    return computeAnalytics(toInput(datasets));
  },

  /** Recompute + persist group performance scores. */
  async recalculateGroupScores(): Promise<{ updated: number }> {
    const a = await this.get();
    const updated = await distributionAnalyticsRepository.persistGroupScores(
      a.groups.map((g) => ({ id: g.id, score: g.score, leads: g.leads })),
    );
    return { updated };
  },

  /** Recompute + persist campaign rollups + score. */
  async recalculateCampaignScores(): Promise<{ updated: number }> {
    const a = await this.get();
    const updated = await distributionAnalyticsRepository.persistCampaignScores(
      a.campaigns.map((c) => ({ id: c.id, score: c.score, published: c.published, leads: c.leads, groupsUsed: c.groupsUsed, successRate: c.publishingSuccessRate })),
    );
    return { updated };
  },

  /** Recompute + persist variation performance into metadata. */
  async recalculateVariationScores(): Promise<{ updated: number }> {
    const a = await this.get();
    const updated = await distributionAnalyticsRepository.persistVariationScores(
      a.variations.map((v) => ({ id: v.id, score: v.score, comments: v.comments, leads: v.leads, conversionRate: v.conversionRate, usedCount: v.usedCount })),
    );
    return { updated };
  },

  /** Just the recommendations (and the data-sufficiency note). */
  async recommendations(): Promise<{ recommendations: Recommendation[]; enough: boolean; note: string }> {
    const a = await this.get();
    return { recommendations: a.recommendations, enough: a.sufficiency.enough, note: a.sufficiency.note };
  },
};
