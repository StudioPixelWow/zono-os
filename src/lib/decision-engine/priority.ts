// ============================================================================
// 🎯 Priority Engine (pure). 27.4 · Part 4.
// A 0..100 priority from business impact, urgency, confidence, time-sensitivity,
// missing-action pressure and market conditions. Never random, always bounded.
// ============================================================================
export interface PriorityInputs {
  businessImpact: number;   // 0..100
  urgency: number;          // 0..100
  confidence: number;       // 0..100
  timeSensitivity: number;  // 0..100
  marketConditions: number; // 0..100
  missingAction: boolean;   // a required action isn't happening → adds pressure
}

export function computePriority(i: PriorityInputs): number {
  const base = 0.30 * i.businessImpact + 0.25 * i.urgency + 0.20 * i.confidence + 0.15 * i.timeSensitivity + 0.10 * i.marketConditions;
  return Math.max(0, Math.min(100, Math.round(base + (i.missingAction ? 6 : 0))));
}
