// ============================================================================
// ZONO Brokerage Knowledge — Explainability formatter (pure).
// Every AI decision must explain itself — never a black box. Turns evidence
// reasons + a confidence into a consistent human-readable explanation.
// ============================================================================

export interface Explanation {
  confidence: number;
  reasons: string[];
  text: string;
  level: "high" | "medium" | "low";
}

function level(confidence: number): "high" | "medium" | "low" {
  return confidence >= 90 ? "high" : confidence >= 70 ? "medium" : "low";
}

/** Format an explainable decision: a verb + the evidence list + confidence. */
export function explain(headline: string, reasons: string[], confidence: number): Explanation {
  const c = Math.round(Math.max(0, Math.min(100, confidence)));
  const reasonText = reasons.length ? reasons.map((r) => `• ${r}`).join("\n") : "• אין ראיות חזקות";
  const text = `${headline}\nכי:\n${reasonText}\nביטחון: ${c}%`;
  return { confidence: c, reasons, text, level: level(c) };
}
