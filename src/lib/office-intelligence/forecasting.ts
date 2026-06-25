// ============================================================================
// ZONO — Office forecasting (pure, deterministic). Uses current pipeline +
// exclusive probabilities + opportunity scores, with labeled fallback
// assumptions when history is thin. No fabricated certainty.
// ============================================================================
import { clamp } from "./analytics";
import type { ForecastResult } from "./types";

export interface ForecastInput {
  /** Sum of exclusive probabilities (0..1 each) across active opportunities. */
  probabilitySum: number;
  highProbabilityCount: number;       // exclusive_probability >= 70
  totalOpportunities: number;
  dealsInProgress: number;
  pipelineValue: number;              // ₪ of opportunity prices
  meetingsLast30: number | null;      // history, if available
  /** Historical exclusive conversion rate (signed / contacted), if available. */
  historicalConversion: number | null;
  /** Commission rate assumption (e.g. 0.02). */
  commissionRate?: number;
}

const DEFAULT_COMMISSION_RATE = 0.02;
const DEFAULT_DEAL_CONVERSION = 0.25; // fallback: 25% of exclusives → deals/month

export function forecastOffice(input: ForecastInput): ForecastResult {
  const assumptions: string[] = [];
  const commissionRate = input.commissionRate ?? DEFAULT_COMMISSION_RATE;

  // Likely exclusives ≈ expected value of probabilities (capped by reality).
  const likelyExclusives = Math.round(clamp(input.probabilitySum, 0, input.totalOpportunities));
  if (input.probabilitySum > 0) assumptions.push("צפי בלעדיות מבוסס על סכום הסתברויות הבלעדיות הדטרמיניסטיות.");

  // Likely deals: historical conversion if present, else a labeled fallback.
  let dealConversion = input.historicalConversion;
  if (dealConversion == null) { dealConversion = DEFAULT_DEAL_CONVERSION; assumptions.push(`אין מספיק היסטוריה — הנחת המרה של ${Math.round(DEFAULT_DEAL_CONVERSION * 100)}% מבלעדיות לעסקה.`); }
  else assumptions.push("המרת עסקאות מבוססת על היסטוריה.");
  const likelyDeals = Math.round(likelyExclusives * dealConversion + input.dealsInProgress * 0.5);

  const likelyMeetings = input.meetingsLast30 != null
    ? Math.round(input.meetingsLast30 * 1.0)
    : (() => { assumptions.push("צפי פגישות מבוסס על מספר ההזדמנויות הפעילות (אין היסטוריה)."); return Math.round(input.highProbabilityCount * 1.2); })();

  const pipelineValue = Math.round(input.pipelineValue);
  const estimatedCommission = Math.round(likelyDeals * (pipelineValue / Math.max(1, input.totalOpportunities)) * commissionRate);
  assumptions.push(`הערכת עמלות לפי ${Math.round(commissionRate * 100)}% מערך העסקה הממוצע.`);

  // Confidence grows with data volume + history.
  let confidencePct = 40;
  if (input.totalOpportunities >= 20) confidencePct += 15;
  if (input.historicalConversion != null) confidencePct += 25;
  if (input.meetingsLast30 != null) confidencePct += 10;
  confidencePct = clamp(confidencePct, 25, 90);

  return { likelyExclusives, likelyDeals, likelyMeetings, pipelineValue, estimatedCommission, confidencePct, assumptions };
}
