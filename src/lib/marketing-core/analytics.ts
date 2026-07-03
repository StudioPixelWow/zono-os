// ============================================================================
// 📣 Marketing Core — analytics model (pure). 33.0.
// Campaign health/readiness/execution-readiness + workspace marketing health.
// Evidence-based; expected reach/leads/ROI are transparent estimates from budget.
// ============================================================================
import { approvalStatus } from "./approval";
import type { Campaign, CampaignAnalytics, CampaignApproval, CampaignAsset, CampaignAudience, CampaignBudget, MarketingHealth } from "./types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function computeAnalytics(p: {
  budget: CampaignBudget; approvals: CampaignApproval[]; assets: CampaignAsset[]; audiences: CampaignAudience[];
  confidence: number; truthScore: number | null;
}): CampaignAnalytics {
  const assetsReady = p.assets.length ? p.assets.filter((a) => a.status === "ready").length / p.assets.length : 0;
  const hasAudience = p.audiences.length > 0 ? 1 : 0;
  const audienceQuality = p.audiences.length ? p.audiences.reduce((s, a) => s + a.matchQuality, 0) / p.audiences.length : 0;
  const budgetSet = p.budget.recommended > 0 ? 1 : 0;
  const readiness = clamp((assetsReady * 40) + (hasAudience * 30) + (budgetSet * 30));
  const status = approvalStatus(p.approvals);
  const executionReadiness = clamp(status === "complete" ? 100 : status === "partial" ? 55 : 15);
  const health = clamp(readiness * 0.4 + p.confidence * 0.3 + audienceQuality * 0.3);
  return {
    health, readiness, executionReadiness,
    expectedReach: p.budget.expectedReach, expectedLeads: p.budget.expectedLeads, expectedRoi: p.budget.expectedRoi,
    budgetUsagePct: 0, approvalStatus: status, aiConfidence: p.confidence, truthScore: p.truthScore,
  };
}

const OBJECTIVE_COVERAGE = ["lead_generation", "seller_acquisition", "buyer_acquisition", "property_exposure", "brand_awareness"] as const;

export function marketingHealth(campaigns: Campaign[], pendingApprovals: number): MarketingHealth {
  const covered = new Set(campaigns.map((c) => c.goal.objective));
  const coverage = clamp((OBJECTIVE_COVERAGE.filter((o) => covered.has(o)).length / OBJECTIVE_COVERAGE.length) * 100);
  const avgHealth = campaigns.length ? campaigns.reduce((s, c) => s + c.analytics.health, 0) / campaigns.length : 0;
  const score = clamp(avgHealth * 0.6 + coverage * 0.4);
  const label: MarketingHealth["label"] = score >= 75 ? "מצוין" : score >= 50 ? "יציב" : score >= 25 ? "דורש תשומת לב" : "חלש";
  const basis = [`${campaigns.length} קמפיינים בתכנון`, `כיסוי ${coverage}% מיעדי הליבה`, `${pendingApprovals} אישורים ממתינים`];
  return { score, label, activeCampaigns: campaigns.length, pendingApprovals, coverage, basis };
}
