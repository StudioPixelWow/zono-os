// ============================================================================
// ZONO — Office Health Score (pure, deterministic, 0..100). Weighted blend of
// nine component sub-scores, each already normalized to 0..100 by the caller
// from deterministic engine outputs.
// ============================================================================
import { clamp, round } from "./analytics";
import type { HealthComponent, HealthScore } from "./types";

const COMPONENTS: { key: string; label: string; weight: number }[] = [
  { key: "pipeline_health", label: "בריאות פייפליין", weight: 16 },
  { key: "task_discipline", label: "משמעת משימות", weight: 12 },
  { key: "response_time", label: "זמן תגובה", weight: 12 },
  { key: "buyer_activity", label: "פעילות קונים", weight: 11 },
  { key: "seller_activity", label: "פעילות מוכרים", weight: 11 },
  { key: "exclusive_growth", label: "צמיחת בלעדיות", weight: 12 },
  { key: "opportunity_handling", label: "טיפול בהזדמנויות", weight: 12 },
  { key: "automation_usage", label: "שימוש באוטומציה", weight: 7 },
  { key: "provider_quality", label: "איכות ספקים", weight: 7 },
];

export type HealthInput = Partial<Record<string, number>>; // key → 0..100 sub-score

export function computeHealthScore(scores: HealthInput): HealthScore {
  let weighted = 0;
  let weightSum = 0;
  const components: HealthComponent[] = COMPONENTS.map((c) => {
    const score = round(clamp(scores[c.key] ?? 0, 0, 100), 0);
    weighted += score * c.weight;
    weightSum += c.weight;
    return { key: c.key, label: c.label, score, weight: c.weight };
  });
  const total = round(weightSum > 0 ? weighted / weightSum : 0, 0);
  const band: HealthScore["band"] = total >= 85 ? "excellent" : total >= 70 ? "good" : total >= 50 ? "fair" : "at_risk";
  return { total, band, components };
}

export const HEALTH_COMPONENTS = COMPONENTS;
