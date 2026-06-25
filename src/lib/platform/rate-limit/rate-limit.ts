// ============================================================================
// ZONO — rate limiting (pure fixed-window + in-memory limiter). Protects AI,
// sync, cron, reports, exports and authentication from overload/abuse. The pure
// `decide` is deterministic; the limiter holds bounded in-memory counters.
// ============================================================================
import type { RateLimitConfig, RateLimitDecision, RateLimitDomain } from "../types";

export const RATE_LIMITS: Record<RateLimitDomain, RateLimitConfig> = {
  ai: { limit: 60, windowMs: 60_000 },          // 60 AI calls / min / subject
  sync: { limit: 10, windowMs: 60_000 },        // 10 manual syncs / min
  cron: { limit: 4, windowMs: 60_000 },         // cron guard
  reports: { limit: 20, windowMs: 60_000 },
  exports: { limit: 30, windowMs: 60_000 },
  auth: { limit: 10, windowMs: 60_000 },        // 10 auth attempts / min
};

/** Pure decision given the current window's count + window start. */
export function decide(count: number, windowStartMs: number, cfg: RateLimitConfig, now = Date.now()): RateLimitDecision {
  const elapsed = now - windowStartMs;
  const resetMs = Math.max(0, cfg.windowMs - elapsed);
  if (elapsed >= cfg.windowMs) return { allowed: true, remaining: cfg.limit - 1, resetMs: cfg.windowMs, retryAfterMs: 0 };
  const remaining = cfg.limit - count;
  if (remaining > 0) return { allowed: true, remaining: remaining - 1, resetMs, retryAfterMs: 0 };
  return { allowed: false, remaining: 0, resetMs, retryAfterMs: resetMs };
}

/** Bounded in-memory fixed-window limiter keyed by `<domain>:<subject>`. */
export class RateLimiter {
  private windows = new Map<string, { count: number; startMs: number }>();
  check(domain: RateLimitDomain, subject: string, now = Date.now()): RateLimitDecision {
    const key = `${domain}:${subject}`;
    const cfg = RATE_LIMITS[domain];
    const w = this.windows.get(key);
    if (!w || now - w.startMs >= cfg.windowMs) { this.windows.set(key, { count: 1, startMs: now }); return decide(0, now, cfg, now); }
    const d = decide(w.count, w.startMs, cfg, now);
    if (d.allowed) w.count++;
    return d;
  }
  reset(): void { this.windows.clear(); }
}

export const rateLimiter = new RateLimiter();
