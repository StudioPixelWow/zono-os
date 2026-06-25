// ============================================================================
// ZONO — retry engine (pure, deterministic given a jitter source). Retries only
// RETRYABLE failures, with exponential backoff + bounded jitter + max attempts.
// ============================================================================
import type { RetryDecision, RetryPolicy } from "../types";

export const DEFAULT_RETRY: RetryPolicy = { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 60_000, jitterRatio: 0.2 };

// Error classes ZONO treats as retryable (transient). Anything else is terminal.
const RETRYABLE = /(timeout|timed out|econnreset|econnrefused|etimedout|rate.?limit|429|503|502|temporarily|unavailable|network)/i;

export function isRetryableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return RETRYABLE.test(msg);
}

/** Exponential backoff with deterministic jitter (jitter01 ∈ [0,1)). */
export function backoffDelay(attempt: number, policy: RetryPolicy = DEFAULT_RETRY, jitter01 = 0.5): number {
  const exp = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** Math.max(0, attempt - 1));
  const jitter = exp * policy.jitterRatio * (jitter01 * 2 - 1); // ±jitterRatio
  return Math.max(0, Math.round(exp + jitter));
}

/**
 * Decide whether to retry. attempt = the attempt that just FAILED (1-based).
 * Retries only when the error is retryable and attempts remain.
 */
export function decideRetry(error: unknown, attempt: number, policy: RetryPolicy = DEFAULT_RETRY, jitter01 = 0.5): RetryDecision {
  if (!isRetryableError(error)) return { retry: false, attempt, delayMs: 0, reason: "non-retryable error" };
  if (attempt >= policy.maxAttempts) return { retry: false, attempt, delayMs: 0, reason: "max attempts reached" };
  return { retry: true, attempt, delayMs: backoffDelay(attempt + 1, policy, jitter01), reason: "retryable failure" };
}

/** Run an async op with retries. The handler decides retryability via thrown errors. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, policy: RetryPolicy = DEFAULT_RETRY, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<T> {
  let attempt = 0;
  for (;;) {
    attempt++;
    try { return await fn(attempt); }
    catch (e) {
      const d = decideRetry(e, attempt, policy, Math.random());
      if (!d.retry) throw e;
      await sleep(d.delayMs);
    }
  }
}
