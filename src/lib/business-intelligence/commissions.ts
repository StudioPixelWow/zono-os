// ============================================================================
// ZONO — Revenue + commission engine (pure, deterministic). Estimates expected
// / lost / at-risk revenue and breaks it down by agent / area / property type /
// source. Uses a labeled commission-rate assumption; never fabricates closed
// revenue.
// ============================================================================
import { round, sharePercent } from "./analytics";
import type { RevenueBreakdownRow, RevenueSummary } from "./types";

export const DEFAULT_COMMISSION_RATE = 0.02;

export interface RevenueShareInput { key: string; label: string; pipelineValue: number; commissionRate?: number }

export interface RevenueInput {
  expectedRevenue: number;          // ₪ expected (forecast pipeline value)
  commissionRate?: number;
  /** open opportunities that decayed / were ignored → lost revenue estimate. */
  lostOpportunityValue: number;
  /** at-risk = value of stuck/overdue/high-risk opportunities. */
  atRiskValue: number;
  byAgent: RevenueShareInput[];
  byArea: RevenueShareInput[];
  byPropertyType: RevenueShareInput[];
  bySource: RevenueShareInput[];
}

function breakdown(rows: RevenueShareInput[], rate: number): RevenueBreakdownRow[] {
  const total = rows.reduce((s, r) => s + Math.max(0, r.pipelineValue), 0);
  return rows
    .map((r) => {
      const revenue = Math.round(Math.max(0, r.pipelineValue));
      const commission = Math.round(revenue * (r.commissionRate ?? rate));
      return { key: r.key, label: r.label, revenue, commission, sharePercent: sharePercent(revenue, total) };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 25);
}

export function computeRevenue(i: RevenueInput): RevenueSummary {
  const rate = i.commissionRate ?? DEFAULT_COMMISSION_RATE;
  return {
    expectedRevenue: Math.round(i.expectedRevenue),
    expectedCommission: Math.round(i.expectedRevenue * rate),
    lostRevenue: Math.round(Math.max(0, i.lostOpportunityValue)),
    revenueAtRisk: Math.round(Math.max(0, i.atRiskValue)),
    byAgent: breakdown(i.byAgent, rate),
    byArea: breakdown(i.byArea, rate),
    byPropertyType: breakdown(i.byPropertyType, rate),
    bySource: breakdown(i.bySource, rate),
    note: `אומדן: ${round(rate * 100, 1)}% עמלה מערך הפייפליין. לא הכנסה בפועל.`,
  };
}
