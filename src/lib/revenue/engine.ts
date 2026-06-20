/**
 * Revenue Intelligence Engine — deterministic, client-safe, no LLM, no server
 * imports. Pure formulas for the revenue gap score, gap level, and the office
 * growth simulation. All monetary inputs are in agorot/shekels (integers).
 */

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export type GapLevel = "on_track" | "watch" | "risk" | "critical";
export const GAP_LEVEL_LABEL: Record<GapLevel, string> = {
  on_track: "במסלול", watch: "במעקב", risk: "בסיכון", critical: "קריטי",
};

/**
 * Revenue gap score 0..100 — how well projected revenue (already realized this
 * period + probability-weighted forecast) covers the target. 100 = target met.
 */
export function revenueGapScore(target: number, projected: number): number {
  if (target <= 0) return projected > 0 ? 100 : 50; // no target set → neutral-high
  return clamp((projected / target) * 100);
}

export function gapLevel(score: number): GapLevel {
  if (score >= 90) return "on_track";
  if (score >= 70) return "watch";
  if (score >= 45) return "risk";
  return "critical";
}

/** Growth rate (%) of current period vs prior period. */
export function growthRate(current: number, prior: number): number {
  if (prior <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - prior) / prior) * 10000) / 100;
}

/** Revenue efficiency — value generated per unit of active load (₪ per active item). */
export function revenueEfficiency(revenue: number, forecast: number, activeLoad: number): number {
  if (activeLoad <= 0) return 0;
  return Math.round((revenue + forecast * 0.4) / activeLoad);
}

// ── Office Growth Model (deterministic simulation) ───────────────────────────
export interface GrowthBaseline {
  monthlyRevenue: number;       // current realized monthly run-rate
  forecastRevenue90: number;    // 90-day probability-weighted pipeline
  activeProperties: number;
  activeBuyers: number;
  agents: number;
  localities: number;
  avgCommissionPerDeal: number; // ₪
  avgDealsPerAgentMonth: number;
}

export interface GrowthScenario { key: string; label: string; addedMonthlyRevenue: number; addedAnnualRevenue: number; assumption: string }

/**
 * Simulate the marginal revenue impact of growth levers. Deterministic — uses
 * the office's own ratios, never external data. Conservative multipliers.
 */
export function simulateGrowth(b: GrowthBaseline): GrowthScenario[] {
  const monthly = Math.max(0, b.monthlyRevenue);
  const perPropertyMonthly = b.activeProperties > 0 ? monthly / b.activeProperties : b.avgCommissionPerDeal * 0.1;
  const perBuyerMonthly = b.activeBuyers > 0 ? monthly / b.activeBuyers : b.avgCommissionPerDeal * 0.08;
  const perAgentMonthly = b.agents > 0 ? monthly / b.agents : b.avgDealsPerAgentMonth * b.avgCommissionPerDeal;
  const perLocalityMonthly = b.localities > 0 ? monthly / b.localities : b.avgCommissionPerDeal * 0.5;

  const inv = Math.round(perPropertyMonthly * Math.ceil(b.activeProperties * 0.1) * 0.6); // 10% more inventory, 60% realization
  const buy = Math.round(perBuyerMonthly * Math.ceil(b.activeBuyers * 0.1) * 0.6);
  const agent = Math.round(perAgentMonthly * 0.7); // a new agent ramps to ~70% of average
  const loc = Math.round(perLocalityMonthly * 0.5); // a new locality at ~50% of average

  const mk = (key: string, label: string, m: number, assumption: string): GrowthScenario =>
    ({ key, label, addedMonthlyRevenue: Math.max(0, m), addedAnnualRevenue: Math.max(0, m) * 12, assumption });

  return [
    mk("inventory", "+10% מלאי", inv, "תוספת מלאי בריאליזציה של 60% מהממוצע למ״ר הקיים"),
    mk("buyers", "+10% קונים", buy, "תוספת קונים בריאליזציה של 60% מההמרה הקיימת"),
    mk("agent", "+סוכן 1", agent, "סוכן חדש מתבסס לכ-70% מתפוקת הממוצע"),
    mk("locality", "+אזור 1", loc, "אזור חדש בכ-50% מתפוקת הממוצע לאזור"),
  ];
}

export function buildRevenueAi(profile: { gap_level: string; revenue_gap: number; forecast_revenue_90: number; revenue_at_risk: number }): string {
  const lvl = GAP_LEVEL_LABEL[profile.gap_level as GapLevel] ?? profile.gap_level;
  return `סטטוס הכנסות: ${lvl}. צנרת 90 יום ${Math.round(profile.forecast_revenue_90).toLocaleString()}₪${profile.revenue_gap > 0 ? ` · חסר ${Math.round(profile.revenue_gap).toLocaleString()}₪ ליעד` : " · היעד מכוסה"}${profile.revenue_at_risk > 0 ? ` · בסיכון ${Math.round(profile.revenue_at_risk).toLocaleString()}₪` : ""}.`;
}
