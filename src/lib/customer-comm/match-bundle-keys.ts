// ============================================================================
// ZONO — Buyer-match bundle key helpers (PURE, unit-testable). The cross-channel
// dedup key and the matches-ready event idempotency key MUST be deterministic per
// buyer-per-Israel-day, so two concurrent or replayed cron runs resolve to the
// SAME key and the unique(org_id, dedup_key) on notification_deliveries (and the
// domain-event idempotency index) collapse the second send. A random bundle id in
// the key — the previous behaviour — could not. No IO.
// ============================================================================

/** Stable YYYY-MM-DD in Asia/Jerusalem (DST-aware via ICU). */
export function israelDayKey(nowMs: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(nowMs));
}

/** Cross-channel dedup key for a buyer's bundle on a given Israel day. */
export const buyerMatchDedupKey = (buyerId: string, nowMs: number): string =>
  `buyer-match:${buyerId}:${israelDayKey(nowMs)}`;

/** Idempotency key for the buyer.matches_ready domain event on a given Israel day. */
export const buyerMatchEventKey = (buyerId: string, nowMs: number): string =>
  `buyer.matches_ready:${buyerId}:${israelDayKey(nowMs)}`;
