// ============================================================================
// 🧱 ZONO Platform Persistence — pure core (client-safe, offline-testable). 34.2.
// Deterministic helpers shared by the compute-cache / intelligence-snapshot /
// org-memory / ask-log repositories: cache-key building, TTL→expiry math,
// freshness and expiry checks. No I/O, no secrets — safe to unit-test offline.
// ============================================================================

/** Stable cache key from a namespace + ordered parts (null/undefined dropped). */
export function buildCacheKey(parts: Array<string | number | null | undefined>): string {
  return parts
    .filter((p) => p !== null && p !== undefined && String(p).length > 0)
    .map((p) => String(p).trim().toLowerCase().replace(/\s+/g, "_"))
    .join(":");
}

/** Convert a TTL (seconds) to an absolute ISO expiry from `nowMs`. null ttl → no expiry. */
export function ttlToExpiry(ttlSeconds: number | null, nowMs: number = Date.now()): string | null {
  if (ttlSeconds == null || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0) return null;
  return new Date(nowMs + ttlSeconds * 1000).toISOString();
}

/** True when `expiresAt` is in the past relative to `nowMs`. Null expiry never expires. */
export function isExpired(expiresAt: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t <= nowMs;
}

/** Age of a computed artifact in whole seconds (>= 0). Invalid input → null. */
export function freshnessSeconds(computedAt: string | null | undefined, nowMs: number = Date.now()): number | null {
  if (!computedAt) return null;
  const t = Date.parse(computedAt);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / 1000));
}

/** Clamp a 0..1 confidence, tolerating 0..100 inputs and nulls. */
export function normConfidence(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  // Rescale only values clearly on a 0..100 scale (> 2); otherwise clamp to 0..1.
  const x = v > 2 ? v / 100 : v;
  return Math.min(1, Math.max(0, x));
}

/**
 * Guard for service-role (BYPASSRLS) code paths that touch tenant data: throws
 * unless a non-empty org id is present. Wrap tenant reads/writes made with the
 * service-role client so a missing org scope fails loudly instead of leaking
 * across tenants. Not needed for national/shared corpora (e.g. brokerage_*).
 */
export function assertOrgScoped(orgId: string | null | undefined, context = "service-role query"): asserts orgId is string {
  if (typeof orgId !== "string" || orgId.trim().length === 0) {
    throw new Error(`[assertOrgScoped] refusing ${context}: missing org scope (org_id).`);
  }
}
