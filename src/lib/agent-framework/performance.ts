// ============================================================================
// 🤖 Agent Framework — performance (pure). 29.1. Part 10.
// Recommendations / approved / rejected / completed / failed / ignored, success
// rate, average impact and false positives — from an organizational (not LLM)
// action log. Evidence-based; no fabrication.
// ============================================================================
import type { AgentActionRecord, AgentPerformance, Impact } from "./types";

const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(n)));
const IMPACT_VAL: Record<Impact, number> = { high: 100, medium: 60, low: 30 };

export function emptyPerformance(): AgentPerformance {
  return { recommendations: 0, approved: 0, rejected: 0, completed: 0, failed: 0, ignored: 0, successRatePct: 0, avgImpact: 0, falsePositives: 0 };
}

export function computePerformance(records: AgentActionRecord[], impacts: Impact[] = []): AgentPerformance {
  const c = (k: AgentActionRecord["kind"]) => records.filter((r) => r.kind === k).length;
  const recommendations = c("recommended");
  const approved = c("approved"), rejected = c("rejected"), completed = c("completed"), failed = c("failed"), ignored = c("ignored");
  const decided = approved + rejected;
  const successRatePct = completed + failed ? clamp((completed / (completed + failed)) * 100) : 0;
  const avgImpact = impacts.length ? clamp(impacts.reduce((s, i) => s + IMPACT_VAL[i], 0) / impacts.length) : 0;
  // False positives: recommendations that were rejected or ignored (agent over-fired).
  const falsePositives = rejected + ignored;
  void decided;
  return { recommendations, approved, rejected, completed, failed, ignored, successRatePct, avgImpact, falsePositives };
}

/** Performance derived from persisted inbox items (statuses + impacts). */
export function performanceFromInbox(items: { status: string; impact: Impact }[]): AgentPerformance {
  const c = (st: string) => items.filter((i) => i.status === st).length;
  const recommendations = items.length;
  const approved = c("approved"), rejected = c("rejected"), completed = c("completed");
  const decided = approved + completed + rejected;
  const successRatePct = decided ? clamp(((approved + completed) / decided) * 100) : 0;
  const avgImpact = items.length ? clamp(items.reduce((s, i) => s + IMPACT_VAL[i.impact], 0) / items.length) : 0;
  return { recommendations, approved, rejected, completed, failed: 0, ignored: 0, successRatePct, avgImpact, falsePositives: rejected };
}

/** Agent health from performance + pending load (0..100). */
export function agentHealth(perf: AgentPerformance, pendingApprovals: number, enabled: boolean): number {
  if (!enabled) return 0;
  const acceptance = perf.approved + perf.rejected ? (perf.approved / (perf.approved + perf.rejected)) * 100 : 60;
  const backlogPenalty = Math.min(25, pendingApprovals * 3);
  return clamp(acceptance * 0.5 + perf.successRatePct * 0.4 - backlogPenalty + 20);
}
