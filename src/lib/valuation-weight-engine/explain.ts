// ============================================================================
// Valuation Weight Engine™ — Hebrew explanation (PURE, deterministic, no LLM).
// Renders the "Built from: <source> X% …" breakdown + value/confidence summary.
// ============================================================================
import type { ValuationWeightResult } from "./types";

const fmt = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;

/** Build the explainable Hebrew summary for a weight result. */
export function buildValuationWeightExplanation(r: ValuationWeightResult): string {
  const lines: string[] = [];
  lines.push(`שווי מוערך: ${fmt(r.estimatedValue)} · רמת ביטחון: ${r.finalConfidence}%.`);
  lines.push(`טווח: ${fmt(r.estimatedLow)}–${fmt(r.estimatedHigh)}.`);
  const top = r.evidence.filter((e) => e.weight > 0).map((e) => `${e.label} ${r1(e.weight)}%`);
  if (top.length) lines.push(`מורכב מ: ${top.join(" · ")}.`);
  // Always state that official transactions remain the strongest source.
  const official = r.evidence.find((e) => e.source === "officialTransactions");
  if (official && official.weight > 0) {
    lines.push("עסקאות רשמיות נותרות מקור ההערכה החזק ביותר — קבלת השוק היא אות נוסף בלבד ואינה מחליפה עסקאות מאומתות.");
  }
  for (const n of r.notes) lines.push(n);
  return lines.join(" ");
}

function r1(n: number): number { return Math.round(n * 10) / 10; }
