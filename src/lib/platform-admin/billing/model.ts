// ============================================================================
// ZONO — PLATFORM BILLING model (P5.5). PURE, client-safe, deterministic.
// ----------------------------------------------------------------------------
// The canonical COMMERCIAL-state decision (mirrors P5.4's access resolver). The
// server layer (server/billing.ts) only fetches the org's subscription / license
// / latest-payment rows and delegates every decision to the pure functions here.
// HARD RULES (P5.5 spec):
//   · Only populate fields backed by REAL data; otherwise mark UNAVAILABLE.
//   · NEVER fabricate revenue. No recurring-amount source exists today, so
//     recurringAmount + MRR/ARR are UNAVAILABLE by construction (see audit).
//   · Do NOT infer "overdue" from MISSING rows — missing data → UNKNOWN.
//   · BILLING STATUS is separate from PRODUCT ACCESS (P5.4 shadow mode stays
//     authoritative for rollout). This file decides billing only.
// ============================================================================
import type { PlanTier } from "@/lib/launch/types";
import type { SubscriptionStatus, PaymentStatus } from "@/lib/commercial/types";
import { normalizePlanTier } from "@/lib/platform-admin/access/model";

// ── Canonical billing state ─────────────────────────────────────────────────
// Deterministic, explainable. Derived from ACTUAL subscription status (primary)
// or the latest real payment (only when there is no subscription). PENDING_PAYMENT
// is kept distinct from PAYMENT_FAILED so "awaiting first charge" is never shown
// as a failure. UNKNOWN = no commercial data to decide from (NOT "overdue").
export type BillingState =
  | "HEALTHY" | "TRIAL" | "PENDING_PAYMENT" | "PAYMENT_FAILED"
  | "GRACE" | "CANCEL_PENDING" | "CANCELLED" | "UNKNOWN";

export const BILLING_STATE_LABEL: Record<BillingState, string> = {
  HEALTHY: "תקין", TRIAL: "תקופת ניסיון", PENDING_PAYMENT: "ממתין לתשלום",
  PAYMENT_FAILED: "כשל תשלום", GRACE: "תקופת חסד", CANCEL_PENDING: "ביטול בסוף התקופה",
  CANCELLED: "מבוטל", UNKNOWN: "לא ידוע",
};

export interface BillingStateResult { state: BillingState; reason: string }

export interface SubscriptionInput {
  status: SubscriptionStatus;
  planTier: string;
  periodStart: string | null;
  periodEnd: string | null;
  trialEndsAt: string | null;
  graceUntil: string | null;
  cancelAtPeriodEnd: boolean;
  growSubscriptionId: string | null;
}
export interface PaymentInput {
  status: PaymentStatus;
  verified: boolean;
  amountIls: number | null;
  currency: string | null;
  provider: string | null;
  createdAt: string | null;
}

/**
 * THE canonical, deterministic billing-state decision. Subscription status is
 * authoritative; the latest payment is consulted ONLY when there is no
 * subscription. Missing everything → UNKNOWN (never inferred as failed/overdue).
 */
export function resolveBillingState(sub: SubscriptionInput | null, latestPayment: PaymentInput | null): BillingStateResult {
  if (sub) {
    switch (sub.status) {
      case "trial": return { state: "TRIAL", reason: "מנוי בתקופת ניסיון" };
      case "active": return sub.cancelAtPeriodEnd
        ? { state: "CANCEL_PENDING", reason: "פעיל — מסומן לביטול בסוף התקופה" }
        : { state: "HEALTHY", reason: "מנוי פעיל" };
      case "grace_period": return { state: "GRACE", reason: "בתקופת חסד לאחר כשל תשלום" };
      case "suspended": return { state: "PAYMENT_FAILED", reason: "מנוי מושהה עקב כשל תשלום" };
      case "pending_payment": return { state: "PENDING_PAYMENT", reason: "ממתין לתשלום ראשון — טרם הופעל" };
      case "cancelled": return { state: "CANCELLED", reason: "המנוי בוטל" };
      case "expired": return { state: "CANCELLED", reason: "המנוי פג תוקף" };
      default: return { state: "UNKNOWN", reason: "סטטוס מנוי לא מזוהה" };
    }
  }
  // No subscription: only a REAL failed payment is a signal; missing → UNKNOWN.
  if (latestPayment && latestPayment.status === "failed") {
    return { state: "PAYMENT_FAILED", reason: "אין מנוי; התשלום האחרון נכשל" };
  }
  return { state: "UNKNOWN", reason: "אין נתונים מסחריים לארגון" };
}

// ── Availability wrapper — every derived money value carries its provenance ──
export type AvailableValue<T> =
  | { available: true; value: T; source: string }
  | { available: false; reason: string };

export function avail<T>(value: T, source: string): AvailableValue<T> { return { available: true, value, source }; }
export function unavail<T>(reason: string): AvailableValue<T> { return { available: false, reason }; }

// ── Canonical billing DTO (spec §2) — only real-data-backed fields populated ─
export interface CanonicalBilling {
  plan: PlanTier;                              // reconciled canonical tier
  subscriptionStatus: SubscriptionStatus | null;
  billingState: BillingState;
  billingReason: string;
  recurringAmount: AvailableValue<number>;     // MISSING source → always unavailable
  currency: string | null;                     // from a real payment only
  periodStart: string | null;
  periodEnd: string | null;
  trialEndsAt: string | null;
  graceUntil: string | null;
  cancelAtPeriodEnd: boolean | null;
  lastPaymentStatus: PaymentStatus | null;
  lastPaymentAt: string | null;
  lastPaymentVerified: boolean | null;
  provider: string | null;
  /** Display-only price hint (labeled ESTIMATE — never summed into revenue). */
  priceHintIls: number | null;
}

// The audit established there is NO authoritative recurring-amount column on
// subscriptions; priceHintIls is display-only. This constant documents WHY every
// recurring/MRR value is unavailable, in one place.
export const NO_RECURRING_SOURCE_REASON =
  "אין מקור סמכותי לסכום חוזר (אין עמודת מחיר על המנוי; priceHintIls להצגה בלבד)";

// ── Plan compatibility resolver (spec §7) ───────────────────────────────────
// organizations.plan uses enum vocab (starter/pro/team/enterprise) while
// org_plans.plan and subscriptions.plan_tier use launch vocab (starter/
// professional/office/enterprise). We RECONCILE (never overwrite): commercial
// sources win over the org enum, and we flag any real conflict for the operator.
export type PlanSource = "subscription" | "org_plan" | "organization" | "none";
export interface PlanCompat {
  canonical: PlanTier;
  source: PlanSource;
  conflict: boolean;                 // ≥2 sources present and normalize differently
  raw: { subscription: string | null; orgPlan: string | null; organization: string | null };
  normalized: { subscription: PlanTier | null; orgPlan: PlanTier | null; organization: PlanTier | null };
}

export function resolvePlanCompat(input: {
  subscriptionPlanTier: string | null;
  orgPlansPlan: string | null;
  organizationsPlan: string | null;
}): PlanCompat {
  const nSub = input.subscriptionPlanTier != null ? normalizePlanTier(input.subscriptionPlanTier) : null;
  const nOrgPlan = input.orgPlansPlan != null ? normalizePlanTier(input.orgPlansPlan) : null;
  const nOrg = input.organizationsPlan != null ? normalizePlanTier(input.organizationsPlan) : null;

  // Precedence: commercial subscription → license (org_plans) → org enum.
  let canonical: PlanTier; let source: PlanSource;
  if (nSub != null) { canonical = nSub; source = "subscription"; }
  else if (nOrgPlan != null) { canonical = nOrgPlan; source = "org_plan"; }
  else if (nOrg != null) { canonical = nOrg; source = "organization"; }
  else { canonical = "starter"; source = "none"; }

  const present = [nSub, nOrgPlan, nOrg].filter((x): x is PlanTier => x != null);
  const conflict = present.length >= 2 && new Set(present).size > 1;

  return {
    canonical, source, conflict,
    raw: { subscription: input.subscriptionPlanTier, orgPlan: input.orgPlansPlan, organization: input.organizationsPlan },
    normalized: { subscription: nSub, orgPlan: nOrgPlan, organization: nOrg },
  };
}

// ── Grow provider classification (spec §8) ──────────────────────────────────
// From the code+DB audit: webhook HMAC verification is real (fail-closed), but
// checkout is an env-gated querystring redirect with no authenticated Grow API
// call, and production DB has ZERO subscriptions/payments. So: SIMULATED.
export type ProviderClass = "LIVE" | "PARTIAL" | "SIMULATED" | "MISSING";
export interface ProviderStatus {
  provider: "grow";
  classification: ProviderClass;
  checkoutConfigured: boolean;       // GROW_CHECKOUT_URL present
  webhookSecretConfigured: boolean;  // GROW_WEBHOOK_SECRET present
  notes: string[];
}

/** Deterministic classification from env presence + observed capabilities. */
export function classifyGrow(env: { checkoutUrl: boolean; webhookSecret: boolean }): ProviderStatus {
  const notes: string[] = [];
  let classification: ProviderClass;
  if (!env.checkoutUrl && !env.webhookSecret) {
    classification = "SIMULATED";
    notes.push("GROW_CHECKOUT_URL ו-GROW_WEBHOOK_SECRET אינם מוגדרים — הרשמה נעצרת בעמוד פנימי");
  } else if (env.checkoutUrl && env.webhookSecret) {
    // Even fully-configured, checkout is an unauthenticated redirect (no Grow API)
    // and there is no renewal/recurring handling — so at most PARTIAL, not LIVE.
    classification = "PARTIAL";
    notes.push("צ'קאאוט + אימות webhook מוגדרים, אך אין קריאת API מאומתת, אין חידוש/חוזר — לא מלא");
  } else {
    classification = "PARTIAL";
    notes.push("הגדרה חלקית — רק אחד מ-GROW_CHECKOUT_URL / GROW_WEBHOOK_SECRET מוגדר");
  }
  notes.push("אימות חתימת webhook (HMAC-SHA256, fail-closed) קיים בקוד");
  notes.push("אין חידוש חוזר, אין refunds/invoices/coupons/proration");
  return { provider: "grow", classification, checkoutConfigured: env.checkoutUrl, webhookSecretConfigured: env.webhookSecret, notes };
}
