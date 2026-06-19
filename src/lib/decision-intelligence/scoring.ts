/**
 * Decision Intelligence — deterministic scoring (no AI, no server imports).
 * Turns raw property/seller/activity signals into business-priority scores.
 */

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export interface UrgencyInput {
  daysSinceActivity?: number | null;
  overdue?: boolean;
  churnRisk?: number | null;
  severity?: string | null;
}

export function calculateUrgencyScore(i: UrgencyInput): number {
  let s = 20;
  const d = i.daysSinceActivity;
  if (d != null) {
    if (d >= 21) s += 45;
    else if (d >= 14) s += 35;
    else if (d >= 7) s += 20;
  }
  if (i.overdue) s += 30;
  if (i.churnRisk != null) s += Math.min(40, i.churnRisk * 0.4);
  if (i.severity === "critical") s += 30;
  else if (i.severity === "high") s += 20;
  else if (i.severity === "medium") s += 10;
  return clamp(s);
}

/** Revenue weight of an entity (property price tier / seller active-listing value). */
export function calculateRevenueImpactScore(i: { price?: number | null; activeProperties?: number }): number {
  if (i.price != null) {
    if (i.price >= 5_000_000) return 100;
    if (i.price >= 3_000_000) return 85;
    if (i.price >= 2_000_000) return 70;
    if (i.price >= 1_000_000) return 55;
    if (i.price > 0) return 40;
    return 20;
  }
  if (i.activeProperties != null) return clamp(30 + i.activeProperties * 30);
  return 30;
}

export function calculateRelationshipImpactScore(i: { trust?: number | null; churn?: number | null }): number {
  // Lower trust + higher churn = higher relationship impact (more at stake).
  const trustGap = i.trust != null ? 100 - i.trust : 40;
  const churn = i.churn ?? 0;
  return clamp(trustGap * 0.5 + churn * 0.5);
}

export function calculateChurnImpactScore(i: { churnRisk?: number | null }): number {
  return clamp(i.churnRisk ?? 0);
}

/** Overall business impact: blend of revenue + relationship/churn weight. */
export function calculateImpactScore(i: { revenueImpact: number; relationshipImpact: number; churnImpact: number }): number {
  return clamp(i.revenueImpact * 0.45 + i.relationshipImpact * 0.3 + i.churnImpact * 0.25);
}

/** The headline number: how much this competes for the agent's attention. */
export function calculateAttentionScore(i: { urgency: number; impact: number; confidence: number }): number {
  return clamp(i.urgency * 0.45 + i.impact * 0.35 + i.confidence * 0.2);
}

export type Tone = "good" | "medium" | "risk";
export function scoreTone(n: number): Tone {
  if (n >= 70) return "good";
  if (n >= 45) return "medium";
  return "risk";
}
export function attentionTone(n: number): Tone {
  if (n >= 70) return "risk";
  if (n >= 45) return "medium";
  return "good";
}
export function attentionLevel(n: number): string {
  if (n >= 80) return "קריטי";
  if (n >= 60) return "גבוה";
  if (n >= 40) return "בינוני";
  return "נמוך";
}
