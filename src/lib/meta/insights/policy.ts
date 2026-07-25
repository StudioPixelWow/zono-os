// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INSIGHT REFRESH POLICY (PURE). Phase 2.
// ----------------------------------------------------------------------------
// Bounds how often (and whether) a subject's insights are refreshed. There is NO
// unbounded polling and NO full scan: a freshly-published object refreshes soon,
// then on a decaying cadence (frequent for its first days, then daily), and
// QUIESCES once it is older than the max age. Accounts refresh on a steady daily
// cadence (bounded per subject, one job at a time). Jitter is injected for
// determinism. Pure: (subject age + refresh count + now) → next schedule.
// ============================================================================
import type { InsightSubjectKind } from "./domain";

export interface RefreshPolicy {
  initialDelayMs: number;
  earlyWindowMs: number;    // "young object" window with frequent refresh
  earlyCadenceMs: number;   // cadence while young
  matureCadenceMs: number;  // cadence while mature (daily)
  accountCadenceMs: number; // steady account cadence
  maxObjectAgeMs: number;   // stop object refresh beyond this age
  jitterRatio: number;
}
export const DEFAULT_REFRESH_POLICY: RefreshPolicy = {
  initialDelayMs: 15 * 60_000,          // first insight ~15 min after publish
  earlyWindowMs: 3 * 24 * 3600_000,     // frequent for the first 3 days
  earlyCadenceMs: 6 * 3600_000,         // every 6h while young
  matureCadenceMs: 24 * 3600_000,       // daily once mature
  accountCadenceMs: 24 * 3600_000,      // daily account snapshot
  maxObjectAgeMs: 30 * 24 * 3600_000,   // quiesce objects after 30 days
  jitterRatio: 0.2,
};

export interface RefreshScheduleInput {
  subjectKind: InsightSubjectKind;
  objectAgeMs: number;      // since first observed (0 for a fresh subject)
  refreshCount: number;
  externallyTriggered?: boolean;
  policy?: RefreshPolicy;
  jitterFraction: number;
}
export interface RefreshSchedule { schedule: boolean; delayMs: number; quiesce: boolean; reason: string }

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const jitter = (ms: number, ratio: number, f: number) => Math.round(ms * (1 + ratio * (clamp01(f) - 0.5) * 2));

/** Decide whether (and when) to refresh a subject's insights. Bounded + deterministic. */
export function nextRefresh(input: RefreshScheduleInput): RefreshSchedule {
  const p = input.policy ?? DEFAULT_REFRESH_POLICY;
  if (input.subjectKind === "account") {
    return { schedule: true, delayMs: jitter(p.accountCadenceMs, p.jitterRatio, input.jitterFraction), quiesce: false, reason: "account_daily" };
  }
  // Object insights.
  if (input.objectAgeMs > p.maxObjectAgeMs && !input.externallyTriggered) return { schedule: false, delayMs: 0, quiesce: true, reason: "object_beyond_max_age" };
  if (input.refreshCount === 0) return { schedule: true, delayMs: jitter(p.initialDelayMs, p.jitterRatio, input.jitterFraction), quiesce: false, reason: "initial" };
  if (input.objectAgeMs < p.earlyWindowMs) return { schedule: true, delayMs: jitter(p.earlyCadenceMs, p.jitterRatio, input.jitterFraction), quiesce: false, reason: "young_frequent" };
  return { schedule: true, delayMs: jitter(p.matureCadenceMs, p.jitterRatio, input.jitterFraction), quiesce: false, reason: "mature_daily" };
}
