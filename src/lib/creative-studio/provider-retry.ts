// ============================================================================
// ZONO creative-studio — provider transport retry (pure logic + runner).
//
// This is ONLY provider-transport retry (transient network/HTTP). It is a
// DIFFERENT mechanism from (2) creative-QA regeneration and (3) human-requested
// refinement — each has its own history and cost records. Never retry permanent
// errors (invalid input, auth, safety rejection, unsupported model).
// ============================================================================

export type ProviderErrorClass =
  | "transient"        // 429 / 502 / 503 / timeout / connection reset — retry
  | "auth"             // 401 / 403 — do not retry
  | "invalid_input"    // 400 — do not retry
  | "safety"           // content policy rejection — do not retry
  | "unsupported"      // unknown/unsupported model — do not retry
  | "permanent";       // any other non-retryable

const TRANSIENT_STATUS = new Set([429, 502, 503, 504]);
const TRANSIENT_PATTERNS = /(timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|socket hang up|network|fetch failed)/i;

/** Classify an unknown thrown error/status into a stable class. Pure. */
export function classifyProviderError(err: unknown): { klass: ProviderErrorClass; status?: number } {
  const anyErr = err as { status?: number; statusCode?: number; code?: string; message?: string } | undefined;
  const status = anyErr?.status ?? anyErr?.statusCode;
  const msg = (anyErr?.message ?? String(err ?? "")) + " " + (anyErr?.code ?? "");
  if (status && TRANSIENT_STATUS.has(status)) return { klass: "transient", status };
  if (status === 401 || status === 403) return { klass: "auth", status };
  if (status === 400) return { klass: "invalid_input", status };
  if (status === 404 || /unsupported|unknown model|model_not_found/i.test(msg)) return { klass: "unsupported", status };
  if (/safety|content policy|moderation|rejected/i.test(msg)) return { klass: "safety", status };
  if (TRANSIENT_PATTERNS.test(msg)) return { klass: "transient", status };
  return { klass: "permanent", status };
}

export function isRetryable(klass: ProviderErrorClass): boolean {
  return klass === "transient";
}

export interface RetryPolicy {
  maxAttempts?: number;     // default 3
  baseDelayMs?: number;     // default 500
  maxDelayMs?: number;      // default 8000
  totalBudgetMs?: number;   // default 30000
  jitter?: boolean;         // default true
}

/** Exponential backoff with optional jitter. Pure (rng injected for determinism). */
export function computeBackoffMs(attempt: number, policy: RetryPolicy = {}, rng: () => number = Math.random): number {
  const base = policy.baseDelayMs ?? 500;
  const max = policy.maxDelayMs ?? 8000;
  const raw = Math.min(max, base * Math.pow(2, Math.max(0, attempt - 1)));
  if (policy.jitter === false) return raw;
  // full jitter
  return Math.round(raw * (0.5 + 0.5 * rng()));
}

export interface RetryOutcome<T> {
  ok: boolean;
  value?: T;
  attempts: number;
  lastClass?: ProviderErrorClass;
  error?: unknown;
}

/**
 * Run `fn` with transient-only retry. Signals + backoff are injectable so the
 * runner is testable without real timers. Returns a structured outcome (never
 * throws for a handled provider error — the caller records it).
 */
export async function withProviderRetry<T>(
  fn: (attempt: number) => Promise<T>,
  policy: RetryPolicy = {},
  deps: { sleep?: (ms: number) => Promise<void>; now?: () => number; rng?: () => number } = {},
): Promise<RetryOutcome<T>> {
  const maxAttempts = policy.maxAttempts ?? 3;
  const budget = policy.totalBudgetMs ?? 30000;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => Date.now());
  const rng = deps.rng ?? Math.random;
  const start = now();
  let lastClass: ProviderErrorClass | undefined;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const value = await fn(attempt);
      return { ok: true, value, attempts: attempt };
    } catch (err) {
      lastErr = err;
      const { klass } = classifyProviderError(err);
      lastClass = klass;
      if (!isRetryable(klass) || attempt >= maxAttempts) break;
      const delay = computeBackoffMs(attempt, policy, rng);
      if (now() - start + delay > budget) break;
      await sleep(delay);
    }
  }
  return { ok: false, attempts: Math.min(maxAttempts, (lastClass ? maxAttempts : 1)), lastClass, error: lastErr };
}
