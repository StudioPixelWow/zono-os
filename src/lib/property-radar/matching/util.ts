// ============================================================================
// ZONO Property Radar™ — matching helpers (pure, client-safe).
// ============================================================================

/** End-of-today (local) as an ISO string — used for the perfect-match task due date. */
export function endOfTodayIso(now: Date = new Date()): string {
  const d = new Date(now);
  d.setHours(23, 59, 0, 0);
  return d.toISOString();
}
