// ============================================================================
// ZONO — Executive pipeline (pure, deterministic). Builds the 11-stage funnel
// from current deterministic aggregates. Conversion/loss are computed from the
// monotone funnel; values are estimated from the pipeline value. Honest note.
// ============================================================================
import { clamp, round, sharePercent } from "./analytics";
import type { PipelineStage, PipelineStageKey, PipelineSummary } from "./types";

const STAGE_LABEL: Record<PipelineStageKey, string> = {
  opportunity: "הזדמנות", contact: "יצירת קשר", meeting: "פגישה", negotiation: "משא ומתן",
  exclusive: "בלעדיות", marketing: "שיווק", buyer_match: "התאמת קונה", showing: "צפייה",
  offer: "הצעה", deal: "עסקה", closed: "נסגר",
};
const ORDER: PipelineStageKey[] = ["opportunity", "contact", "meeting", "negotiation", "exclusive", "marketing", "buyer_match", "showing", "offer", "deal", "closed"];

export interface PipelineInput {
  opportunity: number; contact: number; meeting: number; negotiation: number;
  exclusive: number; marketing: number; buyerMatch: number; showing: number;
  offer: number; deal: number; closed: number;
  pipelineValue: number;          // ₪ across active opportunities
  avgDaysByStage?: Partial<Record<PipelineStageKey, number>>;
}

export function buildPipeline(i: PipelineInput): PipelineSummary {
  const counts: Record<PipelineStageKey, number> = {
    opportunity: i.opportunity, contact: i.contact, meeting: i.meeting, negotiation: i.negotiation,
    exclusive: i.exclusive, marketing: i.marketing, buyer_match: i.buyerMatch, showing: i.showing,
    offer: i.offer, deal: i.deal, closed: i.closed,
  };
  const top = Math.max(1, counts.opportunity);
  const stages: PipelineStage[] = ORDER.map((key, idx) => {
    const count = Math.max(0, counts[key]);
    const next = idx < ORDER.length - 1 ? counts[ORDER[idx + 1]!] : count;
    const conversionPct = idx < ORDER.length - 1 ? clamp(sharePercent(next, Math.max(1, count)), 0, 100) : 100;
    const lossPct = round(clamp(100 - conversionPct, 0, 100), 1);
    // Stage value ≈ pipeline value scaled by the stage's share of the top of funnel.
    const value = Math.round(i.pipelineValue * clamp(count / top, 0, 1));
    return { key, label: STAGE_LABEL[key], count, value, conversionPct, avgDays: i.avgDaysByStage?.[key] ?? null, lossPct };
  });
  const overallConversionPct = clamp(sharePercent(counts.closed, top), 0, 100);
  return {
    stages, totalValue: Math.round(i.pipelineValue), overallConversionPct,
    note: "נגזר מהמצרפים הנוכחיים של המנועים הדטרמיניסטיים (לא ממקור עסקה היסטורי).",
  };
}

export { STAGE_LABEL as PIPELINE_STAGE_LABELS, ORDER as PIPELINE_ORDER };
