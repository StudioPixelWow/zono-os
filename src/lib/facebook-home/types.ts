// ============================================================================
// 📘 ZONO Facebook Growth Platform™ — types (client-safe). 37.0.
// The UNIFYING cockpit over the EXISTING Facebook stack (distribution center,
// groups intelligence, comments engine, market domination, connection paths,
// property marketing). It re-implements NOTHING — it defines the LEAN inputs the
// pure assembler consumes (mapped from existing read models in the service) and
// the composed Facebook Home output. Compliance: assisted/manual only; every
// action is approval-gated; no automation, no scraping.
// ============================================================================

export const FACEBOOK_HOME_VERSION = "37.0";
export type Impact = "high" | "medium" | "low";

export interface FbConnection {
  metaStatus: string;           // meta_oauth path status
  extensionStatus: string;      // chrome_extension path status
  connected: boolean;           // any path usable
  warnings: string[];
}

export interface FbKpis {
  groups: number; activeGroups: number;
  campaigns: number; activeCampaigns: number;
  scheduledPosts: number; publishedPosts: number;
  comments: number; needsReply: number;
  leads: number; newLeads: number;
  reach: number; conversionRate: number;
}

export interface FbGroup {
  id: string; name: string; city: string | null; folder: string | null;
  performance: number; leadScore: number; totalLeads: number; daysSincePost: number | null;
  recommendation: string | null; href: string;
}
export interface FbGroups {
  best: FbGroup[]; weak: FbGroup[]; inactive: FbGroup[]; opportunity: FbGroup[];
  coverageGaps: { area: string; why: string }[];
  summary: { total: number; strong: number; weak: number; inactive: number; noLeads: number };
}

export interface FbCampaign { id: string; name: string; status: string; city: string | null; totalGroups: number; totalLeads: number; href: string }
export interface FbScheduledPost { id: string; title: string; status: string; scheduledAt: string | null; href: string }
export interface FbCommentItem { id: string; author: string; text: string; category: string; suggestedReply: string; shouldCreateLead: boolean; href: string }

export interface FbRecommendation {
  kind: "best_time" | "weak_city" | "missing_groups" | "missing_campaigns" | "inactive_pages" | "opportunity";
  title: string; why: string; evidence: string[]; impact: Impact;
  cta: { href: string; label: string } | null;
}

export interface FbMarketplaceItem {
  id: string; title: string; city: string | null; status: string;
  lastExposureAt: string | null; recommendRenew: boolean; priority: Impact; href: string;
}

export interface FbPerformance {
  reach: number; posts: number; comments: number; leads: number; conversions: number; conversionRate: number;
  topCampaigns: { name: string; leads: number }[];
  topGroups: { name: string; leads: number; performance: number }[];
}

export interface FacebookHome {
  version: string;
  generatedAt: string;
  connection: FbConnection;
  kpis: FbKpis;
  groups: FbGroups;
  comments: { counts: { total: number; needsReply: number; hotLeads: number; leads: number }; needsReplyItems: FbCommentItem[]; leadCandidates: FbCommentItem[] };
  campaigns: FbCampaign[];
  scheduled: FbScheduledPost[];
  performance: FbPerformance;
  recommendations: FbRecommendation[];
  marketplace: FbMarketplaceItem[];
  notes: string[];
}

// ── Lean inputs for the pure assembler (mapped from existing read models) ────
export interface FbInput {
  connection: FbConnection;
  stats: FbKpis;
  groups: {
    id: string; name: string; city: string | null; folder: string | null;
    performance: number; leadScore: number; totalLeads: number; daysSincePost: number | null; recommendation: string | null;
  }[];
  groupSummary: { total: number; strong: number; weak: number; inactive: number; noLeads: number };
  comments: { total: number; needsReply: number; hotLeads: number; leads: number };
  needsReplyItems: FbCommentItem[];
  leadCandidates: FbCommentItem[];
  campaigns: FbCampaign[];
  scheduled: FbScheduledPost[];
  territoryActions: { title: string; why: string; evidence: string[]; impact: Impact; href: string; label: string; kind: string; areaName: string }[];
  weakAreas: { name: string; score: number }[];
  missingAreas: { name: string }[];
  properties: { id: string; title: string; city: string | null; status: string; lastExposureAt: string | null; zonoScore: number | null }[];
  notes: string[];
  now?: number;
}
