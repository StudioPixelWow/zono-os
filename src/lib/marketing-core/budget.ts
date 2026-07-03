// ============================================================================
// 📣 Marketing Core — budget engine (pure). 33.0.
// Deterministic budget/reach/ROI ESTIMATES from public channel heuristics +
// audience size. Every number is flagged `estimate: true` — never presented as
// a promise. No fabrication: outputs scale transparently with real inputs.
// ============================================================================
import type { CampaignBudget, CampaignChannel, CampaignObjective } from "./types";

// Rough public benchmarks (ILS). Cost-per-lead + CPM per channel. Estimates only.
const CHANNEL_CPL: Record<CampaignChannel, number> = {
  facebook: 55, instagram: 60, google: 75, email: 8, whatsapp: 12, sms: 15, website: 0, landing_page: 40, blog: 20, facebook_groups: 25,
};
const CHANNEL_CPM: Record<CampaignChannel, number> = {
  facebook: 35, instagram: 40, google: 60, email: 3, whatsapp: 5, sms: 8, website: 0, landing_page: 30, blog: 10, facebook_groups: 12,
};

// Objective difficulty multiplier (harder objective → higher cost per result).
const OBJECTIVE_FACTOR: Record<CampaignObjective, number> = {
  lead_generation: 1, buyer_acquisition: 1.1, seller_acquisition: 1.4, recruitment: 1.6, luxury: 1.8, project_launch: 1.5,
  property_exposure: 0.8, neighborhood_promotion: 0.9, brand_awareness: 0.7, price_reduction: 0.9, open_house: 0.85,
  retention: 0.6, referral: 0.7, remarketing: 0.75,
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round = (n: number, step = 100) => Math.max(step, Math.round(n / step) * step);

/** Recommend a budget band for an objective + audience + channels. */
export function recommendBudget(objective: CampaignObjective, audienceSize: number, channels: CampaignChannel[]): CampaignBudget {
  const ch = channels.length ? channels : (["facebook", "instagram"] as CampaignChannel[]);
  const cpl = avg(ch.map((c) => CHANNEL_CPL[c])) * OBJECTIVE_FACTOR[objective];
  const cpm = avg(ch.map((c) => CHANNEL_CPM[c]));
  // Target leads scale with audience (bounded), min 8.
  const targetLeads = Math.max(8, Math.min(120, Math.round(audienceSize * 0.04) + 8));
  const recommended = round(targetLeads * Math.max(cpl, 6));
  const min = round(recommended * 0.5);
  const ideal = round(recommended * 1.6);
  const expectedReach = cpm > 0 ? Math.round((recommended / cpm) * 1000) : audienceSize * 3;
  const expectedLeads = Math.max(1, Math.round(recommended / Math.max(cpl, 6)));
  // ROI band, evidence-based on typical deal value contribution (kept qualitative).
  const roi = objective === "luxury" || objective === "seller_acquisition" ? "גבוה מאוד" : objective === "brand_awareness" || objective === "retention" ? "עקיף" : "גבוה";
  const confidence = Math.max(35, Math.min(80, 70 - Math.round(OBJECTIVE_FACTOR[objective] * 10) + (audienceSize > 50 ? 10 : 0)));
  return { min, recommended, ideal, currency: "ILS", expectedReach, expectedLeads, expectedRoi: roi, confidence, estimate: true };
}
