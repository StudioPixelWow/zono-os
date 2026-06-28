// ============================================================================
// Self-Learning & Model Calibration™ — MAI-13 explanation (PURE).
//
// A short, structured Hebrew headline for a calibration record (metadata).
// Reports measured accuracy / calibration / stability and the ADVISORY
// recommendation only. It never states the model was changed — calibration
// stays human-controlled. No LLM.
// ============================================================================
import type { ModelCalibrationResult, RecommendedAction } from "./types";

const MODEL_HE: Record<string, string> = {
  MARKET_ACCEPTANCE: "קבלת שוק", GAP_ANALYSIS: "ניתוח פערים", WINNING_DNA: "DNA מנצח",
  BROKER_COACH: "מאמן מתווך", GROWTH_STRATEGY: "אסטרטגיית צמיחה", ZONE_DOMINANCE: "שליטה באזור",
  VALUATION_WEIGHT: "מנוע משקלי הערכה",
};

const ACTION_HE: Record<RecommendedAction, string> = {
  NONE: "אין המלצת כיול",
  INCREASE_THRESHOLD: "המלצה: העלאת סף (לבדיקה אנושית)",
  LOWER_THRESHOLD: "המלצה: הורדת סף (לבדיקה אנושית)",
  COLLECT_MORE_EVIDENCE: "המלצה: איסוף ראיות נוספות",
  INCREASE_SAMPLE: "המלצה: הגדלת מדגם",
  REVIEW_WEIGHT_PROFILE: "המלצה: בחינת פרופיל המשקלים (לבדיקה אנושית)",
};

const pct = (v: number | null): string => (v == null ? "—" : `${Math.round(v * 100)}%`);

/** Deterministic Hebrew one-line summary of a model's calibration. */
export function buildCalibrationHeadline(r: ModelCalibrationResult): string {
  const name = MODEL_HE[r.modelName] ?? r.modelName;
  if (r.metadata.notEnoughEvidence) {
    return `${name}: אין כרגע מספיק ראיות לכיול (מדגם ${r.sampleSize}). ${ACTION_HE.COLLECT_MORE_EVIDENCE}.`;
  }
  const parts: string[] = [`${name} · חלון ${r.evaluationWindowDays} ימים · מדגם ${r.sampleSize}`];
  if (r.accuracy != null) parts.push(`דיוק ${pct(r.accuracy)}`);
  if (r.falsePositiveRate != null) parts.push(`FP ${pct(r.falsePositiveRate)}`);
  if (r.falseNegativeRate != null) parts.push(`FN ${pct(r.falseNegativeRate)}`);
  if (r.calibrationScore != null) parts.push(`כיול ${pct(r.calibrationScore)}`);
  if (r.predictionStability != null) parts.push(`יציבות ${pct(r.predictionStability)}`);
  parts.push(ACTION_HE[r.recommendedAction]);
  return `${parts.join(" · ")}. מדידה בלבד — המודל לא שונה.`;
}
