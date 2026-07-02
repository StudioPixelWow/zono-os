// ============================================================================
// 🏠 Listing Agent — Valuation Link (pure). 29.3.1.
// READ-ONLY view over an existing property valuation (no formula change, no
// fake valuation). Computes asking-vs-value: range position, price gap, freshness
// and confidence label. Missing/stale valuations are handled honestly.
// ============================================================================
export type RangePosition = "below" | "within" | "above" | "unknown";
export type ConfidenceLabel = "high" | "medium" | "low" | "none";

export interface ValuationInput {
  available: boolean;
  estimatedValue: number | null;
  lowValue: number | null; highValue: number | null;
  confidence: number | null;          // 0..100
  createdAt: string | null;
  unavailableReason: string | null;
}
export interface ValuationView extends ValuationInput {
  ageDays: number | null; fresh: boolean;
  rangePosition: RangePosition; priceGapPct: number | null;
  confidenceLabel: ConfidenceLabel;
  strongEnoughForPricing: boolean;    // gate: only steer price on real, fresh, confident evidence
}

const DAY = 86400000;
const FRESH_DAYS = 90;

export function confidenceLabelOf(c: number | null): ConfidenceLabel {
  if (c == null) return "none";
  return c >= 66 ? "high" : c >= 40 ? "medium" : c > 0 ? "low" : "none";
}

/** Build the read-only valuation view for a listing (asking price vs valuation). */
export function computeValuationView(askingPrice: number | null, v: ValuationInput, now: number = Date.now()): ValuationView {
  const ageDays = v.createdAt ? Math.max(0, Math.round((now - new Date(v.createdAt).getTime()) / DAY)) : null;
  const fresh = ageDays != null && ageDays <= FRESH_DAYS;
  const confidenceLabel = confidenceLabelOf(v.confidence);

  let rangePosition: RangePosition = "unknown";
  let priceGapPct: number | null = null;
  if (v.available && v.estimatedValue != null && v.estimatedValue > 0 && askingPrice != null) {
    priceGapPct = Math.round(((askingPrice - v.estimatedValue) / v.estimatedValue) * 100);
    const low = v.lowValue ?? v.estimatedValue * 0.92;
    const high = v.highValue ?? v.estimatedValue * 1.08;
    rangePosition = askingPrice > high ? "above" : askingPrice < low ? "below" : "within";
  }

  // Only steer pricing recommendations on evidence that is available, fresh and
  // at least medium confidence — never from weak evidence alone.
  const strongEnoughForPricing = v.available && fresh && (confidenceLabel === "high" || confidenceLabel === "medium") && rangePosition !== "unknown";

  return { ...v, ageDays, fresh, rangePosition, priceGapPct, confidenceLabel, strongEnoughForPricing };
}

export const NO_VALUATION: ValuationView = {
  available: false, estimatedValue: null, lowValue: null, highValue: null, confidence: null, createdAt: null,
  unavailableReason: "אין הערכת שווי זמינה", ageDays: null, fresh: false, rangePosition: "unknown", priceGapPct: null,
  confidenceLabel: "none", strongEnoughForPricing: false,
};
