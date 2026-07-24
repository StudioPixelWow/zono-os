// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PERIODIC VERIFICATION POLICY (PURE). Phase 3C.
// ----------------------------------------------------------------------------
// Bounds how often (and whether) a provider object is re-verified. There is NO
// unbounded lifetime polling and NO full scan: verification runs immediately after
// publish, follows up briefly while a container is processing, follows up on a
// bounded cadence while ambiguous, and STOPS once an object is stable, too old, or
// out of attempts. Old stable content is verified again only on an external
// trigger (webhook / discrepancy / manual request), not on a timer. All cadences
// are bounded constants; jitter is injected for determinism.
// ============================================================================
import type { ProviderObjectState } from "./provider-types";

export interface VerificationPolicy {
  initialDelayMs: number;
  processingFollowupMs: number;
  ambiguousFollowupMs: number;
  maxAttempts: number;
  maxAgeMs: number;
  stableWindowMs: number;
  batchSize: number;
  perOrgConcurrency: number;
  providerConcurrency: number;
  jitterRatio: number;
}
export const DEFAULT_VERIFICATION_POLICY: VerificationPolicy = {
  initialDelayMs: 15_000,
  processingFollowupMs: 30_000,
  ambiguousFollowupMs: 120_000,
  maxAttempts: 6,
  maxAgeMs: 7 * 24 * 3600_000,
  stableWindowMs: 24 * 3600_000,
  batchSize: 8,
  perOrgConcurrency: 3,
  providerConcurrency: 4,
  jitterRatio: 0.2,
};

export interface VerificationScheduleInput {
  state: ProviderObjectState;
  attemptCount: number;
  objectAgeMs: number;
  /** ms since the object last became stable-published (Infinity if never). */
  timeSincePublishedMs: number;
  externallyTriggered?: boolean;
  policy?: VerificationPolicy;
  jitterFraction: number;
}
export interface VerificationSchedule { schedule: boolean; delayMs: number; reason: string }

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const jitter = (ms: number, ratio: number, f: number) => Math.round(ms * (1 + ratio * (clamp01(f) - 0.5) * 2));

/** Decide whether (and when) to verify again. Bounded + deterministic. */
export function nextVerification(input: VerificationScheduleInput): VerificationSchedule {
  const p = input.policy ?? DEFAULT_VERIFICATION_POLICY;
  if (input.objectAgeMs > p.maxAgeMs && !input.externallyTriggered) return { schedule: false, delayMs: 0, reason: "beyond_max_age" };
  if (input.attemptCount >= p.maxAttempts && !input.externallyTriggered) return { schedule: false, delayMs: 0, reason: "attempts_exhausted" };
  if (input.state === "deleted") return { schedule: false, delayMs: 0, reason: "terminal_deleted" };

  if (input.state === "processing") return { schedule: true, delayMs: jitter(p.processingFollowupMs, p.jitterRatio, input.jitterFraction), reason: "processing_followup" };
  if (input.state === "ambiguous" || input.state === "unknown") return { schedule: true, delayMs: jitter(p.ambiguousFollowupMs, p.jitterRatio, input.jitterFraction), reason: "ambiguous_followup" };
  if ((input.state === "published" || input.state === "exists")) {
    if (input.timeSincePublishedMs > p.stableWindowMs && !input.externallyTriggered) return { schedule: false, delayMs: 0, reason: "stable_object_no_periodic_poll" };
    // A single confirmatory follow-up after publish, then quiesce.
    if (input.attemptCount === 0) return { schedule: true, delayMs: jitter(p.initialDelayMs, p.jitterRatio, input.jitterFraction), reason: "initial_confirmation" };
    return { schedule: false, delayMs: 0, reason: "confirmed_stable" };
  }
  if (input.externallyTriggered) return { schedule: true, delayMs: jitter(p.processingFollowupMs, p.jitterRatio, input.jitterFraction), reason: "external_trigger" };
  return { schedule: false, delayMs: 0, reason: "no_followup_needed" };
}
