// ============================================================================
// ZONO — Distribution DB row types (client + server safe).
// ----------------------------------------------------------------------------
// The distribution_* tables are not in the generated Supabase Database type, so
// the repository casts through `as never` and shapes results with the row types
// declared here. These mirror the live schema after the engine + phase-3
// migrations. The repository EXPOSES spec field names (url, area, targetCity,
// targetAudience, campaignGoal, leadScore, …) by mapping to existing columns.
// ============================================================================

export type DistGroupStatus = "active" | "inactive" | "blocked" | "pending";
export type DistCampaignStatus = "draft" | "scheduled" | "active" | "paused" | "completed" | "archived";
// status is a free-text column; it carries both the original engine vocabulary
// and the Phase-5 posting-queue lifecycle (draft|scheduled|queued|publishing|
// published|failed|cancelled).
export type DistPostStatus =
  | "pending" | "scheduled" | "in_progress" | "published" | "failed" | "skipped"
  | "draft" | "queued" | "publishing" | "cancelled";
export type DistLeadStatus = "new" | "contacted" | "qualified" | "converted" | "lost";
export type DistCampaignGroupStatus = "selected" | "posted" | "skipped";

export interface DistGroupRow {
  id: string; org_id: string; name: string; platform: string | null; category: string | null;
  city: string | null; locality: string | null; members_count: number; group_url: string | null;
  external_group_id: string | null; privacy_level: string | null; status: DistGroupStatus;
  performance_score: number; lead_score: number; spam_risk_score: number; last_post_at: string | null;
  rules_notes: string | null; created_by: string | null; metadata: Record<string, unknown>;
  created_at: string; updated_at: string;
}

export interface DistCampaignRow {
  id: string; org_id: string; property_id: string | null; name: string; objective: string | null;
  audience: string | null; cities: string[]; status: DistCampaignStatus; frequency: string | null;
  preferred_time: string | null; total_posts: number; total_groups: number; total_leads: number;
  success_rate: number; starts_at: string | null; ends_at: string | null; created_by: string | null;
  metadata: Record<string, unknown>; created_at: string; updated_at: string;
}

export interface DistCampaignGroupRow {
  id: string; org_id: string; campaign_id: string; group_id: string; status: DistCampaignGroupStatus;
  recommended_order: number | null; expected_reach: number; expected_leads: number; reason: string | null;
  selected_at: string; metadata: Record<string, unknown>; created_at: string; updated_at: string;
}

export interface DistVariationRow {
  id: string; org_id: string; campaign_id: string | null; post_id: string | null; property_id: string | null;
  angle: string | null; tone: string | null; hook: string | null; headline: string | null; body: string | null;
  cta: string | null; hashtags: string[]; wow_score: number; engagement_score: number; prediction_score: number;
  lead_score: number; is_selected: boolean; created_by: string | null; metadata: Record<string, unknown>;
  created_at: string; updated_at: string;
}

export interface DistPostRow {
  id: string; org_id: string; campaign_id: string | null; group_id: string | null; property_id: string | null;
  variation_id: string | null; platform: string | null; status: DistPostStatus; post_title: string | null;
  post_text: string | null; hashtags: string[]; cta: string | null; image_url: string | null;
  scheduled_at: string | null; published_at: string | null; external_post_url: string | null;
  failure_reason: string | null; skipped_reason: string | null; reach: number; engagement: number;
  leads_count: number; priority_score: number; created_by: string | null; metadata: Record<string, unknown>;
  // Phase 6 — provider + manual-publish fields.
  provider: string | null; provider_status: string; manual_publish_required: boolean;
  external_destination_url: string | null; published_by: string | null; published_manually_at: string | null;
  created_at: string; updated_at: string;
}

export interface DistCommentRow {
  id: string; org_id: string; post_id: string | null; group_id: string | null; author_name: string | null;
  author_external_id: string | null; external_comment_id: string | null; author_profile_url: string | null;
  comment_text: string | null; sentiment: string | null; intent: string | null; intent_score: number;
  lead_intent_score: number; is_lead: boolean; handled: boolean; occurred_at: string;
  // Phase 7 — classification + suggested reply + lead link.
  category: string | null; suggested_reply: string | null; should_create_lead: boolean;
  analysis_reason: string | null; lead_id: string | null;
  metadata: Record<string, unknown>; created_at: string; updated_at: string;
}

export interface DistLeadRow {
  id: string; org_id: string; campaign_id: string | null; post_id: string | null; comment_id: string | null;
  group_id: string | null; property_id: string | null; buyer_id: string | null; name: string | null;
  phone: string | null; email: string | null; source: string; intent_score: number; status: DistLeadStatus;
  assigned_to: string | null; notes: string | null; metadata: Record<string, unknown>;
  created_at: string; updated_at: string;
}

export interface DistAnalyticsRow {
  id: string; org_id: string; campaign_id: string | null; group_id: string | null; post_id: string | null;
  period_date: string; posts_count: number; reach: number; engagement: number; impressions: number;
  clicks: number; comments_count: number; leads_count: number; deals_count: number; conversion_rate: number;
  success_rate: number; top_angle: string | null; top_cta: string | null; metadata: Record<string, unknown>;
  created_at: string; updated_at: string;
}

export interface DistAutomationRow {
  id: string; org_id: string; campaign_id: string | null; name: string; automation_type: string;
  description: string | null; trigger_config: Record<string, unknown>; action_config: Record<string, unknown>;
  config_json: Record<string, unknown>; status: string; is_enabled: boolean; last_run_at: string | null;
  next_run_at: string | null; run_count: number; created_by: string | null; metadata: Record<string, unknown>;
  created_at: string; updated_at: string;
}

// Table-name constants (cast targets for the not-yet-typed Database).
export const DIST = {
  groups: "distribution_groups",
  campaigns: "distribution_campaigns",
  campaignGroups: "distribution_campaign_groups",
  variations: "distribution_variations",
  posts: "distribution_posts",
  comments: "distribution_comments",
  leads: "distribution_leads",
  analytics: "distribution_analytics",
  automations: "distribution_automations",
} as const;
