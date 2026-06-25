// ============================================================================
// ZONO — beta mode (pure). Resolves whether beta is active for a subject given
// org-wide + per-user enrollment. Per-user override wins over the org default.
// ============================================================================
import type { BetaContext, BetaEnrollment } from "./types";

/** Collapse enrollment rows for one user into a resolution context. */
export function resolveBetaContext(rows: BetaEnrollment[], userId: string): BetaContext {
  const orgRow = rows.find((r) => r.userId == null);
  const userRow = rows.find((r) => r.userId === userId);
  return {
    orgEnrolled: !!orgRow?.enabled,
    userEnrolled: userRow ? userRow.enabled : null,
  };
}

/** Final beta state: per-user override (if any) else the org default. */
export function isBetaActive(ctx: BetaContext): boolean {
  if (ctx.userEnrolled != null) return ctx.userEnrolled;
  return ctx.orgEnrolled;
}

/** Convenience: resolve + decide in one call. */
export function betaActiveFor(rows: BetaEnrollment[], userId: string): boolean {
  return isBetaActive(resolveBetaContext(rows, userId));
}
