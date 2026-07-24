// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PUBLISH RATE LIMITS (PURE). Phase 3A.
// ----------------------------------------------------------------------------
// Local, deterministic fixed-window limits for publish/retry/status actions —
// NOT Meta Graph rate limits (no Graph call occurs here). Reuses the platform
// `decide`. Pure + testable (no server-only).
// ============================================================================
import { decide } from "@/lib/platform/rate-limit/rate-limit";

export type PublishRateDomain = "publish" | "retry" | "status";
const RATE: Record<PublishRateDomain, { limit: number; windowMs: number }> = {
  publish: { limit: 12, windowMs: 60_000 },
  retry: { limit: 20, windowMs: 60_000 },
  status: { limit: 240, windowMs: 60_000 },
};

const counters = new Map<string, { count: number; windowStartMs: number }>();

/** Deterministic fixed-window rate check for a publish action. */
export function publishRateCheck(domain: PublishRateDomain, subject: string, now = Date.now()): boolean {
  const key = `${domain}:${subject}`; const cfg = RATE[domain]; const cur = counters.get(key);
  const d = decide(cur?.count ?? 0, cur?.windowStartMs ?? now, cfg, now);
  if (d.allowed) counters.set(key, { count: (cur && now - cur.windowStartMs < cfg.windowMs ? cur.count : 0) + 1, windowStartMs: cur && now - cur.windowStartMs < cfg.windowMs ? cur.windowStartMs : now });
  return d.allowed;
}
