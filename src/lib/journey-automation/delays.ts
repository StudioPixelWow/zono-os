// ============================================================================
// ZONO — Delay helpers (pure). Delay/wait nodes pause an execution; the durable
// journey_delayed_actions queue resumes them. Deterministic offset math only.
// ============================================================================
import type { WorkflowNode } from "./types";

export const DELAY_PRESETS: { label: string; minutes: number }[] = [
  { label: "30 דקות", minutes: 30 },
  { label: "שעתיים", minutes: 120 },
  { label: "4 שעות", minutes: 240 },
  { label: "24 שעות", minutes: 1440 },
  { label: "3 ימים", minutes: 4320 },
  { label: "שבוע", minutes: 10080 },
];

export function delayMinutesOf(node: WorkflowNode): number {
  const m = node.delayMinutes ?? (node.config?.minutes as number | undefined) ?? 0;
  return Number.isFinite(m) && m > 0 ? Math.round(m) : 0;
}

export function runAtFrom(nowMs: number, minutes: number): string {
  return new Date(nowMs + minutes * 60_000).toISOString();
}

/** Is this delayed action due to run now? (queue claim guard) */
export function isDue(runAtIso: string, nowMs: number = Date.now()): boolean {
  const t = Date.parse(runAtIso);
  return Number.isFinite(t) && t <= nowMs;
}

export function humanizeMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} דק׳`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} שע׳`;
  return `${Math.round(minutes / 1440)} ימים`;
}
