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

// ── 14-day free trial (from registration) ───────────────────────────────────
export const TRIAL_DAYS = 14;
const DAY_MS = 86_400_000;

/** The moment the org's free trial ends (epoch ms), or null when unknown. */
export function trialEndsAt(orgCreatedAt: string | null | undefined, trialDays: number = TRIAL_DAYS): number | null {
  if (!orgCreatedAt) return null;
  const created = Date.parse(orgCreatedAt);
  return Number.isFinite(created) ? created + trialDays * DAY_MS : null;
}

/** True while the org is still inside its free-trial window (counted from the
 *  registration/creation time). Unknown creation date ⇒ no trial (safe default). */
export function isWithinTrial(orgCreatedAt: string | null | undefined, trialDays: number = TRIAL_DAYS, now: number = Date.now()): boolean {
  const ends = trialEndsAt(orgCreatedAt, trialDays);
  return ends != null && now < ends;
}

/** Whole days left in the trial (0 once it has ended), for UI countdowns. */
export function trialDaysLeft(orgCreatedAt: string | null | undefined, trialDays: number = TRIAL_DAYS, now: number = Date.now()): number {
  const ends = trialEndsAt(orgCreatedAt, trialDays);
  if (ends == null) return 0;
  return Math.max(0, Math.ceil((ends - now) / DAY_MS));
}

/** Pure gate decision. blocked = enforced && !paid && trial has ENDED. A new
 *  office gets full access during its 14-day trial; only an unpaid org whose
 *  trial has lapsed is blocked. */
export function paymentGateDecision(enforced: boolean, paid: boolean, trialActive = false): { enforced: boolean; paid: boolean; blocked: boolean } {
  return { enforced, paid, blocked: enforced && !paid && !trialActive };
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
