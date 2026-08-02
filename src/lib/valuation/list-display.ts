// ============================================================================
// 🏷️ ZONO — valuation LIST display logic (PURE, offline-testable).
// Fixes QA P0-3: the list rendered a failed/insufficient valuation as
// "הושלם · ₪0". The engine already flags unavailable results
// (valuationAvailable=false); this module is the single source of truth for how
// the list turns (estimatedValue, valuationAvailable, status) into a value label
// and a status pill — so a failed calculation is NEVER shown as a successful ₪0.
// ============================================================================

export interface ValuationDisplayInput {
  estimatedValue: number | null;
  /** From metadata.valuationAvailable. Undefined for legacy rows (treated as unknown). */
  valuationAvailable?: boolean | null;
  status: string;
}

/** True when the row has no trustworthy computed value to show. */
export function isUnavailable(v: ValuationDisplayInput): boolean {
  if (v.status === "insufficient_data" || v.status === "failed") return true;
  if (v.valuationAvailable === false) return true;
  // Legacy safety net: a "completed" row with no positive value is not a real result.
  if (v.valuationAvailable == null && (v.estimatedValue == null || v.estimatedValue <= 0)) return true;
  return false;
}

/** The value label. Never returns "₪0" for an unavailable/failed valuation. */
export function valuationValueLabel(v: ValuationDisplayInput): string {
  if (isUnavailable(v)) return "לא חושב";
  if (v.estimatedValue == null) return "—";
  return `₪${Math.round(v.estimatedValue).toLocaleString("he-IL")}`;
}

export type StatusTone = "success" | "warning" | "neutral";

/** The status pill: failure/insufficient is visually distinct from success. */
export function valuationStatusPill(v: ValuationDisplayInput): { label: string; tone: StatusTone } {
  if (isUnavailable(v)) return { label: "לא ניתן לחשב", tone: "warning" };
  switch (v.status) {
    case "completed": return { label: "הושלם", tone: "success" };
    case "draft": return { label: "טיוטה", tone: "neutral" };
    default: return { label: "בעיבוד", tone: "neutral" };
  }
}
