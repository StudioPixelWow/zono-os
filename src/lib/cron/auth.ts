// ============================================================================
// ZONO — Cron authorization contract (PURE, client-safe, unit-testable).
// A background/cron request is authorized IFF CRON_SECRET is configured AND the
// Authorization header is exactly `Bearer <secret>`. It FAILS CLOSED when the
// secret is unset (a cron is never accidentally public) and never reads the
// secret from a query param or a NEXT_PUBLIC_ variable. This is the single
// canonical predicate behind every /api/cron/* route's Bearer check.
// ============================================================================
export function isCronAuthorized(secret: string | null | undefined, authHeader: string | null | undefined): boolean {
  return !!secret && authHeader === `Bearer ${secret}`;
}
