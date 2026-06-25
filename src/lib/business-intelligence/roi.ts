// ============================================================================
// ZONO — ROI engine (pure, deterministic). Translates automation + activity
// counts into hours saved, money saved and ROI %. Uses fixed, explainable
// minute/cost assumptions (no AI, no fabrication).
// ============================================================================
import { round } from "./analytics";
import type { RoiRow, RoiSummary } from "./types";

// Estimated minutes of manual work saved per unit, and agent ₪/hour cost.
const MIN_SAVED: Record<string, number> = {
  calls: 4, meetings: 10, whatsapps: 5, ai_copilot: 12, journey_automation: 6,
  property_radar: 8, marketing: 15, lead_sources: 7, office_time: 3,
};
const HOURLY_COST = 120; // ₪/hour assumption for an agent's time

const LABELS: Record<string, string> = {
  calls: "שיחות", meetings: "פגישות", whatsapps: "וואטסאפ", ai_copilot: "AI Copilot",
  journey_automation: "אוטומציית מסעות", property_radar: "רדאר נכסים", marketing: "שיווק",
  lead_sources: "מקורות לידים", office_time: "זמן משרד",
};

export interface RoiInput {
  counts: Partial<Record<keyof typeof MIN_SAVED, number>>;
  /** Optional ₪ cost per source (to compute true ROI %); defaults to time-cost only. */
  costs?: Partial<Record<string, number>>;
}

export function computeRoi(i: RoiInput): RoiSummary {
  const rows: RoiRow[] = Object.keys(MIN_SAVED).map((key) => {
    const n = Math.max(0, i.counts[key as keyof typeof MIN_SAVED] ?? 0);
    const hoursSaved = round((n * MIN_SAVED[key]!) / 60, 1);
    const moneySaved = Math.round(hoursSaved * HOURLY_COST);
    const cost = i.costs?.[key] ?? 0;
    const roiPercent = cost > 0 ? round(((moneySaved - cost) / cost) * 100, 0) : (moneySaved > 0 ? 100 : 0);
    return { key, label: LABELS[key]!, hoursSaved, moneySaved, roiPercent };
  }).sort((a, b) => b.moneySaved - a.moneySaved);

  const totalHoursSaved = round(rows.reduce((s, r) => s + r.hoursSaved, 0), 1);
  const totalMoneySaved = rows.reduce((s, r) => s + r.moneySaved, 0);
  return { rows, totalHoursSaved, totalMoneySaved, note: `הערכה לפי ${HOURLY_COST}₪ לשעת עבודה ומשך ידני סטנדרטי לכל פעולה.` };
}

export const ROI_HOURLY_COST = HOURLY_COST;
