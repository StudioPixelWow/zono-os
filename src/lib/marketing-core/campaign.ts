// ============================================================================
// 📣 Marketing Core — campaign builder + lifecycle (pure). 33.0.
// Assembles a full Campaign from a seed by REUSING budget/audience/approval/
// analytics engines. Validation + status transitions. Nothing auto-executes.
// ============================================================================
import { recommendBudget } from "./budget";
import { defaultApprovals } from "./approval";
import { computeAnalytics } from "./analytics";
import type {
  Campaign, CampaignObjective, CampaignChannel, CampaignAudience, CampaignAsset, CampaignPriority, CampaignStatus,
  CampaignRecommendation, Impact,
} from "./types";
import { OBJECTIVE_HE } from "./types";

export interface CampaignSeed {
  id: string; name?: string; description?: string; objective: CampaignObjective;
  audiences: CampaignAudience[]; channels: CampaignChannel[]; priority?: CampaignPriority;
  owner?: string | null; evidence: string[]; confidence: number; truthScore: number | null;
  recommendation: CampaignRecommendation; businessImpact?: Impact;
}

const DEFAULT_CHANNELS: Record<CampaignObjective, CampaignChannel[]> = {
  lead_generation: ["facebook", "instagram", "google"], buyer_acquisition: ["facebook", "instagram", "google"],
  seller_acquisition: ["facebook", "google", "landing_page"], recruitment: ["facebook", "instagram", "landing_page"],
  luxury: ["instagram", "landing_page", "google"], project_launch: ["facebook", "instagram", "landing_page", "google"],
  property_exposure: ["facebook", "instagram", "website"], neighborhood_promotion: ["facebook", "facebook_groups", "blog"],
  brand_awareness: ["instagram", "facebook", "blog"], price_reduction: ["facebook", "whatsapp", "email"],
  open_house: ["facebook", "whatsapp", "sms"], retention: ["email", "whatsapp"], referral: ["whatsapp", "email"], remarketing: ["facebook", "instagram", "email"],
};

const DEFAULT_ASSETS: CampaignAsset[] = [
  { kind: "copy", label: "טקסט שיווקי", status: "missing" },
  { kind: "image", label: "תמונת קמפיין", status: "missing" },
  { kind: "landing", label: "דף נחיתה", status: "missing" },
];

export function createCampaign(seed: CampaignSeed): Campaign {
  const channels = seed.channels.length ? seed.channels : DEFAULT_CHANNELS[seed.objective];
  const audienceSize = seed.audiences.reduce((s, a) => s + a.size, 0);
  const budget = recommendBudget(seed.objective, audienceSize, channels);
  const approvals = defaultApprovals();
  const assets = DEFAULT_ASSETS.map((a) => ({ ...a }));
  const analytics = computeAnalytics({ budget, approvals, assets, audiences: seed.audiences, confidence: seed.confidence, truthScore: seed.truthScore });
  const impact: Impact = seed.businessImpact ?? (budget.recommended >= 5000 ? "high" : "medium");
  return {
    id: seed.id, name: seed.name ?? OBJECTIVE_HE[seed.objective], description: seed.description ?? seed.recommendation.why,
    goal: { objective: seed.objective, target: seed.audiences[0]?.label ?? "כללי", expectedLeads: budget.expectedLeads },
    priority: seed.priority ?? (impact === "high" ? "high" : "medium"), status: "planned",
    audiences: seed.audiences, channels, assets,
    budget, approvals, analytics,
    timeline: { proposedLaunch: null, durationDays: 21, reminders: [], dependsOn: [] },
    owner: seed.owner ?? null, evidence: seed.evidence, confidence: seed.confidence,
    expectedRoi: budget.expectedRoi, expectedLeads: budget.expectedLeads, businessImpact: impact,
    recommendation: seed.recommendation,
  };
}

/** Validate a campaign is coherent (used before requesting approvals). */
export function validateCampaign(c: Campaign): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!c.name) issues.push("חסר שם קמפיין");
  if (c.audiences.length === 0) issues.push("לא נבחר קהל יעד");
  if (c.channels.length === 0) issues.push("לא נבחרו ערוצים");
  if (c.budget.recommended <= 0) issues.push("תקציב לא תקין");
  return { ok: issues.length === 0, issues };
}

const FLOW: CampaignStatus[] = ["draft", "planned", "pending_approval", "approved", "scheduled"];
export function nextStatus(c: Campaign): CampaignStatus | null {
  const i = FLOW.indexOf(c.status);
  return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1] : null;
}

/** Priority score for ranking (pure). */
export function priorityScore(c: Campaign): number {
  const impact = c.businessImpact === "high" ? 40 : c.businessImpact === "medium" ? 22 : 10;
  return impact + c.confidence * 0.4 + c.analytics.health * 0.2;
}
