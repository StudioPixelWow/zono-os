// ============================================================================
// ZONO Property Radar™ — market cache freshness helpers (pure).
// TTL decides whether a provider+area was scanned recently enough to skip.
// ============================================================================
import type { MarketAreaCacheState } from "./types";

export const DEFAULT_TTL_MINUTES = 60;

/** Fresh = scanned within TTL (next_scan_after still in the future). */
export function isCacheFresh(
  state: MarketAreaCacheState | null,
  now: Date,
): boolean {
  if (!state || !state.next_scan_after) return false;
  if (state.status === "error" || state.status === "stale") return false;
  const next = Date.parse(state.next_scan_after);
  return Number.isFinite(next) && now.getTime() < next;
}

/** now + ttl as an ISO timestamp. */
export function computeNextScanAfter(now: Date, ttlMinutes: number): string {
  return new Date(now.getTime() + Math.max(1, ttlMinutes) * 60_000).toISOString();
}
