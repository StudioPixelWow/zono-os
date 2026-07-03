// ============================================================================
// 📣 ZONO — Marketing Core™ (Marketing Operating System) — types (pure). 33.0.
// ----------------------------------------------------------------------------
// The centralized, entity-agnostic marketing foundation every future marketing
// feature reuses. It PLANS, RECOMMENDS, BUDGETS and APPROVES — it NEVER publishes
// and never connects to ad networks in this phase. Nothing auto-executes; every
// action is approval-gated. Evidence-only; no fabricated numbers (estimates are
// clearly flagged). No schema changes — the workspace is computed from live
// intelligence produced by the existing engines.
// ============================================================================

export const MARKETING_CORE_VERSION = "33.0";

export type Impact = "low" | "medium" | "high";

export type CampaignObjective =
  | "lead_generation" | "property_exposure" | "luxury" | "brand_awareness" | "recruitment"
  | "neighborhood_promotion" | "project_launch" | "price_reduction" | "open_house"
  | "seller_acquisition" | "buyer_acquisition" | "retention" | "referral" | "remarketing";

export const OBJECTIVE_HE: Record<CampaignObjective, string> = {
  lead_generation: "יצירת לידים", property_exposure: "חשיפת נכס", luxury: "קמפיין יוקרה", brand_awareness: "מודעות למותג",
  recruitment: "גיוס מתווכים", neighborhood_promotion: "קידום שכונה", project_launch: "השקת פרויקט", price_reduction: "הורדת מחיר",
  open_house: "בית פתוח", seller_acquisition: "גיוס מוכרים", buyer_acquisition: "גיוס קונים", retention: "שימור",
  referral: "הפניות", remarketing: "רימרקטינג",
};

export type CampaignChannel =
  | "facebook" | "instagram" | "google" | "email" | "whatsapp" | "sms" | "website" | "landing_page" | "blog" | "facebook_groups";

export const CHANNEL_HE: Record<CampaignChannel, string> = {
  facebook: "פייסבוק", instagram: "אינסטגרם", google: "גוגל", email: "אימייל", whatsapp: "וואטסאפ", sms: "SMS",
  website: "אתר", landing_page: "דף נחיתה", blog: "בלוג", facebook_groups: "קבוצות פייסבוק",
};

export type CampaignStatus = "draft" | "planned" | "pending_approval" | "approved" | "scheduled" | "paused" | "archived";
export const STATUS_HE: Record<CampaignStatus, string> = {
  draft: "טיוטה", planned: "מתוכנן", pending_approval: "ממתין לאישור", approved: "מאושר", scheduled: "מתוזמן", paused: "מושהה", archived: "בארכיון",
};

export type CampaignPriority = "low" | "medium" | "high" | "critical";
export const PRIORITY_HE: Record<CampaignPriority, string> = { low: "נמוכה", medium: "בינונית", high: "גבוהה", critical: "קריטית" };

export type AudienceKind = "buyers" | "sellers" | "leads" | "investors" | "luxury" | "neighborhood" | "dormant" | "repeat" | "high_value";
export const AUDIENCE_HE: Record<AudienceKind, string> = {
  buyers: "קונים", sellers: "מוכרים", leads: "לידים", investors: "משקיעים", luxury: "יוקרה",
  neighborhood: "שכונה", dormant: "רדומים", repeat: "לקוחות חוזרים", high_value: "ערך גבוה",
};

export type ApprovalType = "campaign" | "creative" | "publishing" | "budget" | "execution";
export type ApprovalState = "pending" | "approved" | "rejected";
export const APPROVAL_HE: Record<ApprovalType, string> = { campaign: "אישור קמפיין", creative: "אישור קריאייטיב", publishing: "אישור פרסום", budget: "אישור תקציב", execution: "אישור הפעלה" };

// ── Model pieces ─────────────────────────────────────────────────────────────
export interface CampaignGoal { objective: CampaignObjective; target: string; expectedLeads: number | null }

export interface CampaignAudience {
  kind: AudienceKind; label: string; size: number; matchQuality: number; // 0..100
  evidence: string[]; segmentOf: "buyer" | "seller" | "lead" | "market";
}

export interface CampaignBudget {
  min: number; recommended: number; ideal: number; currency: "ILS";
  expectedReach: number; expectedLeads: number; expectedRoi: string; confidence: number; estimate: true;
}

export interface CampaignApproval { type: ApprovalType; state: ApprovalState; required: boolean; note: string | null }

export interface CampaignAsset { kind: "image" | "video" | "copy" | "landing"; label: string; status: "missing" | "draft" | "ready" }

export interface CampaignAnalytics {
  health: number; readiness: number; executionReadiness: number;
  expectedReach: number; expectedLeads: number; expectedRoi: string; budgetUsagePct: number;
  approvalStatus: "none" | "partial" | "complete"; aiConfidence: number; truthScore: number | null;
}

export interface CampaignTimeline { proposedLaunch: string | null; durationDays: number; reminders: string[]; dependsOn: string[] }

export interface CampaignRecommendation { title: string; why: string; evidence: string[]; impact: Impact; confidence: number }

export interface Campaign {
  id: string; name: string; description: string;
  goal: CampaignGoal; priority: CampaignPriority; status: CampaignStatus;
  audiences: CampaignAudience[]; channels: CampaignChannel[]; assets: CampaignAsset[];
  budget: CampaignBudget; approvals: CampaignApproval[]; analytics: CampaignAnalytics; timeline: CampaignTimeline;
  owner: string | null; evidence: string[]; confidence: number;
  expectedRoi: string; expectedLeads: number; businessImpact: Impact;
  recommendation: CampaignRecommendation;
}

export interface MarketingInsight {
  kind: "opportunity" | "weak_campaign" | "missing_campaign" | "seasonal" | "neighborhood" | "luxury" | "recruitment";
  title: string; body: string; evidence: string[]; impact: Impact; confidence: number;
  suggestedObjective: CampaignObjective | null;
}

export interface MarketingHealth {
  score: number; label: "מצוין" | "יציב" | "דורש תשומת לב" | "חלש";
  activeCampaigns: number; pendingApprovals: number; coverage: number; // % of key objectives covered
  basis: string[];
}

export interface CalendarEntry { campaignId: string; name: string; date: string; kind: "launch" | "reminder" | "review"; note: string }

export interface MarketingWorkspace {
  version: string; generatedAt: string;
  health: MarketingHealth;
  campaigns: Campaign[];                 // recommended plan (not persisted, not published)
  audiences: CampaignAudience[];
  calendar: CalendarEntry[];
  insights: MarketingInsight[];
  pendingApprovals: { campaignId: string; campaignName: string; approval: CampaignApproval }[];
  notes: string[];
}

// ── The normalized input the pure engines consume (built by the server) ──────
export interface MarketingInput {
  org: { score: number; confidence: number; offices: number; brokers: number; activeListings: number };
  buyers: { total: number; hot: number; luxury: number; investors: number; families: number; dormant: number; highValue: number };
  sellers: { total: number; hot: number; atRisk: number; readyToSign: number; priceGap: number; stale: number; highValue: number };
  leads: { total: number; hot: number; cold: number; stale: number; qualified: number };
  listings: { luxury: number; priceDrops: number; newListings: number; underOffer: number; avgTruthScore: number | null; topNeighborhoods: string[] };
  execRecommendations: { title: string; why: string; evidence: string[]; confidence: number; impact: Impact; kind: string }[];
}
