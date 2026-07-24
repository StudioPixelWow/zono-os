// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · AUTOMATIC-RETRY POLICY (PURE). Phase 3B.
// ----------------------------------------------------------------------------
// The ONLY place that decides whether a background failure is retried
// automatically. It reuses the Phase-3A canonical failure classifier verbatim —
// there is no second taxonomy. Automatic retry is permitted for EXACTLY ONE
// class: `retryable_manual` (transient provider/rate/network/media-processing).
// It is NEVER permitted for an AMBIGUOUS write (may have already published →
// manual review / dead-letter), NEVER for a reconnect-required auth failure
// (waits for a human reconnect → blocked), and NEVER for a config/permanent
// failure (→ dead-letter). A successful target is never retried. Backoff is
// bounded exponential with equal-jitter (the random fraction is INJECTED, so the
// decision is deterministic and testable), honours a provider Retry-After floor,
// and is capped by an absolute ceiling. A finite retry budget guarantees
// termination: exhaustion routes to the dead-letter, never an infinite loop.
// ============================================================================
import { classifyFailure, type FailureCategory } from "../publish/classify";
import type { MetaProviderErrorKind } from "../provider/errors";

export interface RetryPolicy {
  baseMs: number;      // first-retry backoff floor
  factor: number;      // exponential growth factor (≥ 1)
  capMs: number;       // cap on the exponential term (before jitter)
  maxDelayMs: number;  // absolute hard ceiling (also bounds a large Retry-After)
  maxAttempts: number; // maximum AUTOMATIC attempts before dead-letter
}

/** Conservative, bounded defaults. No unbounded env value ever feeds these. */
export const DEFAULT_RETRY_POLICY: RetryPolicy = { baseMs: 30_000, factor: 2, capMs: 900_000, maxDelayMs: 3_600_000, maxAttempts: 5 };

export type RetryAction = "retry" | "dead_letter" | "blocked";

export interface RetryDecision {
  action: RetryAction;
  category: FailureCategory;
  /** Backoff delay for a `retry` (0 otherwise). */
  delayMs: number;
  /** Absolute instant the job becomes claimable again (`retry` only). */
  runAfterMs: number | null;
  /** Remaining budget AFTER this decision (decremented on a `retry`). */
  budgetRemaining: number;
  /** Dead-letter reason when action === 'dead_letter'. */
  deadLetterReason: "retries_exhausted" | "permanent_failure" | "ambiguous_result" | null;
  reason: string;
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Is this canonical failure (with its ambiguity flag) eligible for AUTOMATIC retry? */
export function isAutomaticRetryEligible(kind: MetaProviderErrorKind, ambiguous: boolean): boolean {
  if (ambiguous) return false; // an ambiguous write is never safe to auto-replay
  return classifyFailure(kind, false).category === "retryable_manual";
}

/**
 * Bounded exponential backoff with EQUAL jitter. `attemptNumber` is the 1-based
 * index of the retry being scheduled. `jitterFraction` ∈ [0,1) is injected. A
 * provider Retry-After acts as a floor; the absolute ceiling always bounds it.
 */
export function computeBackoffMs(attemptNumber: number, policy: RetryPolicy, jitterFraction: number, retryAfterMs: number | null): number {
  const n = Math.max(1, Math.floor(attemptNumber));
  const exp = policy.baseMs * Math.pow(policy.factor, n - 1);
  const capped = Math.min(policy.capMs, exp);
  const half = capped / 2;
  const jittered = half + half * clamp01(jitterFraction); // equal jitter: [half, capped]
  const floored = Math.max(jittered, retryAfterMs != null && retryAfterMs > 0 ? retryAfterMs : 0);
  return Math.round(Math.min(policy.maxDelayMs, floored));
}

export interface RetryInput {
  errorKind: MetaProviderErrorKind;
  ambiguous: boolean;
  /** Automatic attempts already completed for this target/job. */
  attemptCount: number;
  budgetRemaining: number;
  retryAfterMs: number | null;
  nowMs: number;
  jitterFraction: number;
  policy?: RetryPolicy;
}

/**
 * The canonical automatic-retry decision. Pure + total: given the same inputs it
 * always yields the same action, delay and budget, and it always terminates
 * (budget/attempt exhaustion → dead-letter). It never returns `retry` for an
 * ambiguous, reconnect, config or permanent failure.
 */
export function automaticRetryDecision(input: RetryInput): RetryDecision {
  const policy = input.policy ?? DEFAULT_RETRY_POLICY;
  const cls = classifyFailure(input.errorKind, input.ambiguous);

  // 1. Ambiguous — the write may have reached Meta. Never auto-replay; park it.
  if (input.ambiguous || cls.category === "ambiguous") {
    return { action: "dead_letter", category: "ambiguous", delayMs: 0, runAfterMs: null, budgetRemaining: input.budgetRemaining, deadLetterReason: "ambiguous_result", reason: "ambiguous_write_manual_review" };
  }
  // 2. Reconnect-required auth failure — a human must reconnect; do not burn budget.
  if (cls.category === "reconnect_required") {
    return { action: "blocked", category: cls.category, delayMs: 0, runAfterMs: null, budgetRemaining: input.budgetRemaining, deadLetterReason: null, reason: "reconnect_required" };
  }
  // 3. Config / permanent — retrying cannot help.
  if (cls.category === "config_required" || cls.category === "permanent") {
    return { action: "dead_letter", category: cls.category, delayMs: 0, runAfterMs: null, budgetRemaining: input.budgetRemaining, deadLetterReason: "permanent_failure", reason: "non_retryable_failure" };
  }
  // 4. Transient (retryable_manual) — retry while budget + attempts remain.
  const budgetLeft = input.budgetRemaining;
  if (budgetLeft <= 0 || input.attemptCount >= policy.maxAttempts) {
    return { action: "dead_letter", category: cls.category, delayMs: 0, runAfterMs: null, budgetRemaining: 0, deadLetterReason: "retries_exhausted", reason: "retry_budget_exhausted" };
  }
  const nextAttempt = input.attemptCount + 1;
  const delayMs = computeBackoffMs(nextAttempt, policy, input.jitterFraction, input.retryAfterMs);
  return { action: "retry", category: cls.category, delayMs, runAfterMs: input.nowMs + delayMs, budgetRemaining: budgetLeft - 1, deadLetterReason: null, reason: "transient_retry_scheduled" };
}
