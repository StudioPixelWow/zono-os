// ============================================================================
// ZONO — payment-gate PURE core (no DB, no server-only, unit-tested). The
// enforcement/allowlist rules of the NO-TRIAL gate, separated so they can be
// tested without a database. access-gate.ts wraps these with the live lookups.
// ============================================================================

/** The enforcement cutoff (epoch ms) from env, or null when enforcement is off. */
export function billingEnforcementCutoff(env: string | null | undefined = process.env.BILLING_ENFORCE_AFTER): number | null {
  const raw = (env ?? "").trim();
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

/** True when an org (by created_at) is subject to new-user payment enforcement.
 *  Enforcement off (no cutoff) or unknown age → never enforced (never lock out). */
export function isOrgEnforced(orgCreatedAt: string | null | undefined, cutoff: number | null = billingEnforcementCutoff()): boolean {
  if (cutoff == null) return false;
  if (!orgCreatedAt) return false;
  const created = Date.parse(orgCreatedAt);
  return Number.isFinite(created) && created >= cutoff;
}

/** Pure gate decision from the two facts. blocked = enforced && !paid. */
export function paymentGateDecision(enforced: boolean, paid: boolean): { enforced: boolean; paid: boolean; blocked: boolean } {
  return { enforced, paid, blocked: enforced && !paid };
}

// Paths an UNPAID (blocked) user may still reach — pay, billing, account, help, out.
export const ALLOWED_WHEN_UNPAID: string[] = [
  "/payment-required", "/settings/plan", "/settings/billing", "/account",
  "/billing", "/logout", "/support", "/onboarding",
];

/** Whether a blocked user may load this path (billing / account / pay / support). */
export function isPathAllowedWhenUnpaid(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0];
  if (!p) return true;
  return ALLOWED_WHEN_UNPAID.some((a) => p === a || p.startsWith(`${a}/`));
}
