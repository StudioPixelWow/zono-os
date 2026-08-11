// ============================================================================
// ZONO — PLATFORM BILLING server layer (server-only). P5.5. The commercial
// control plane's ONLY read boundary. Pattern (P5.0):
//     assertPlatformCapability(cap) → service-role query → audit → SAFE DTO.
// HARD RULES:
//   · READ-ONLY in P5.5 (no safe provider mutation exists — Grow is SIMULATED,
//     see billing/model.classifyGrow; report, don't mutate).
//   · NEVER select `signature` / `raw_payload` / provider secrets — payment DTOs
//     expose only safe fields.
//   · NEVER fabricate revenue: verified revenue is a real sum; MRR/ARR/ARPU/
//     churn/trial-conversion are UNAVAILABLE (no recurring-amount source).
//   · Do NOT infer state from missing rows (delegated to the pure resolver).
//   · No N+1: batch org names + latest payments with a single `.in()` each.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { assertPlatformCapability } from "./auth";
import { writePlatformAudit } from "./audit";
import { planDefinition } from "@/lib/launch/plans";
import type { PlanTier } from "@/lib/launch/types";
import type { SubscriptionStatus, PaymentStatus } from "@/lib/commercial/types";
import {
  resolveBillingState, resolvePlanCompat, classifyGrow,
  avail, unavail, NO_RECURRING_SOURCE_REASON,
  type BillingState, type AvailableValue, type PlanCompat, type ProviderStatus,
  type SubscriptionInput, type PaymentInput,
} from "../billing/model";

// ── Raw row shapes (only safe columns are ever selected) ────────────────────
interface RawSubRow {
  org_id: string; plan_tier: string; status: string;
  period_start: string | null; period_end: string | null; trial_ends_at: string | null;
  grace_until: string | null; grow_subscription_id: string | null; cancel_at_period_end: boolean;
}
interface RawPayRow {
  id: string; org_id: string | null; provider: string; plan_tier: string;
  amount_ils: number | null; currency: string | null; status: string;
  verified: boolean; verified_at: string | null; created_at: string;
}

const SUB_COLS = "org_id,plan_tier,status,period_start,period_end,trial_ends_at,grace_until,grow_subscription_id,cancel_at_period_end";
// NOTE: signature + raw_payload are DELIBERATELY excluded (PCI / secret safety).
const PAY_COLS = "id,org_id,provider,plan_tier,amount_ils,currency,status,verified,verified_at,created_at";

function toSubInput(r: RawSubRow): SubscriptionInput {
  return {
    status: r.status as SubscriptionStatus, planTier: r.plan_tier,
    periodStart: r.period_start, periodEnd: r.period_end, trialEndsAt: r.trial_ends_at,
    graceUntil: r.grace_until, cancelAtPeriodEnd: !!r.cancel_at_period_end, growSubscriptionId: r.grow_subscription_id,
  };
}
function toPayInput(r: RawPayRow): PaymentInput {
  return { status: r.status as PaymentStatus, verified: !!r.verified, amountIls: r.amount_ils, currency: r.currency, provider: r.provider, createdAt: r.created_at };
}

// ── Provider status (env-derived, honest) ───────────────────────────────────
export function getGrowProviderStatus(): ProviderStatus {
  return classifyGrow({
    checkoutUrl: !!process.env.GROW_CHECKOUT_URL,
    webhookSecret: !!process.env.GROW_WEBHOOK_SECRET,
  });
}

// ── Revenue overview (spec §3, §11) ─────────────────────────────────────────
export interface SubscriptionTally {
  available: boolean;
  total: number; healthy: number; trial: number; pendingPayment: number;
  paymentFailed: number; grace: number; cancelPending: number; cancelled: number; unknown: number;
}
export interface RevenueOverview {
  subscriptions: SubscriptionTally;
  paymentsVerifiedPaid: AvailableValue<number>;   // count of verified+paid
  paymentsFailed: AvailableValue<number>;         // count of failed
  verifiedRevenueIls: AvailableValue<number>;     // sum(amount_ils) verified+paid
  thisMonthRevenueIls: AvailableValue<number>;    // sum this calendar month
  payingOrgs: AvailableValue<number>;             // distinct orgs verified+paid
  mrr: AvailableValue<number>;
  arr: AvailableValue<number>;
  arpu: AvailableValue<number>;
  churn: AvailableValue<number>;
  trialConversion: AvailableValue<number>;
  provider: ProviderStatus;
  generatedAt: string;
}

const emptyTally = (available: boolean): SubscriptionTally => ({
  available, total: 0, healthy: 0, trial: 0, pendingPayment: 0, paymentFailed: 0, grace: 0, cancelPending: 0, cancelled: 0, unknown: 0,
});

function tallyState(t: SubscriptionTally, s: BillingState): void {
  switch (s) {
    case "HEALTHY": t.healthy++; break;
    case "TRIAL": t.trial++; break;
    case "PENDING_PAYMENT": t.pendingPayment++; break;
    case "PAYMENT_FAILED": t.paymentFailed++; break;
    case "GRACE": t.grace++; break;
    case "CANCEL_PENDING": t.cancelPending++; break;
    case "CANCELLED": t.cancelled++; break;
    default: t.unknown++; break;
  }
}

/**
 * Honest revenue overview. Verified revenue + counts are REAL sums; MRR/ARR/
 * ARPU/churn/trial-conversion are UNAVAILABLE (no authoritative recurring
 * amount, and no sufficient lifecycle history). Cap: platform.billing.read.
 * Audited once as revenue.overview.
 */
export async function getPlatformRevenueOverview(): Promise<RevenueOverview> {
  const operator = await assertPlatformCapability("platform.billing.read");
  const db = createServiceRoleClient();

  // Subscriptions → resolve each to a billing state and tally.
  let subsTally = emptyTally(true);
  try {
    const { data, error } = await db.from("subscriptions" as never).select(SUB_COLS).limit(5000);
    if (error) subsTally = emptyTally(false);
    else {
      const rows = ((data ?? []) as RawSubRow[]);
      subsTally.total = rows.length;
      for (const r of rows) tallyState(subsTally, resolveBillingState(toSubInput(r), null).state);
    }
  } catch { subsTally = emptyTally(false); }

  // Payments → verified/paid count + sum, failed count, this-month sum, paying orgs.
  const monthStart = new Date();
  monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartIso = monthStart.toISOString();

  let paymentsVerifiedPaid: AvailableValue<number> = unavail("שגיאת קריאה");
  let paymentsFailed: AvailableValue<number> = unavail("שגיאת קריאה");
  let verifiedRevenueIls: AvailableValue<number> = unavail("שגיאת קריאה");
  let thisMonthRevenueIls: AvailableValue<number> = unavail("שגיאת קריאה");
  let payingOrgs: AvailableValue<number> = unavail("שגיאת קריאה");
  try {
    // One read of the safe columns for all verified+paid payments; aggregate in memory.
    const { data, error } = await db.from("payments" as never)
      .select("org_id,amount_ils,created_at,status,verified").limit(20000);
    if (error) throw error;
    const rows = ((data ?? []) as { org_id: string | null; amount_ils: number | null; created_at: string; status: string; verified: boolean }[]);
    const verifiedPaid = rows.filter((r) => r.verified && r.status === "paid");
    paymentsVerifiedPaid = avail(verifiedPaid.length, "count(payments WHERE verified AND status='paid')");
    paymentsFailed = avail(rows.filter((r) => r.status === "failed").length, "count(payments WHERE status='failed')");
    verifiedRevenueIls = avail(verifiedPaid.reduce((s, r) => s + (Number(r.amount_ils) || 0), 0), "sum(amount_ils WHERE verified AND status='paid')");
    thisMonthRevenueIls = avail(verifiedPaid.filter((r) => r.created_at >= monthStartIso).reduce((s, r) => s + (Number(r.amount_ils) || 0), 0), "sum(amount_ils WHERE verified AND paid AND created_at>=month_start)");
    payingOrgs = avail(new Set(verifiedPaid.map((r) => r.org_id).filter((x): x is string => !!x)).size, "count(distinct org_id WHERE verified AND paid)");
  } catch {
    // leave all as unavailable
  }

  await writePlatformAudit({
    operator, capability: "platform.billing.read", action: "revenue.overview", resourceType: "platform",
    metadata: { subscriptions: subsTally.total, verifiedRevenue: verifiedRevenueIls.available ? verifiedRevenueIls.value : null },
  });

  return {
    subscriptions: subsTally,
    paymentsVerifiedPaid, paymentsFailed, verifiedRevenueIls, thisMonthRevenueIls, payingOrgs,
    // Honest UNAVAILABLE — documented reasons (no fake MRR/ARR/etc.).
    mrr: unavail(NO_RECURRING_SOURCE_REASON),
    arr: unavail("נגזר מ-MRR שאינו זמין"),
    arpu: unavail("דורש הכנסה חוזרת אמינה — לא זמין"),
    churn: unavail("אין היסטוריית ביטולים מספקת לחישוב נטישה"),
    trialConversion: unavail("אין היסטוריית מעברי ניסיון→תשלום לחישוב המרה"),
    provider: getGrowProviderStatus(),
    generatedAt: new Date().toISOString(),
  };
}

// ── Subscriptions list (spec §4) ────────────────────────────────────────────
export interface SubscriptionFilters {
  status?: BillingState | null;
  plan?: PlanTier | null;
  trialOnly?: boolean; graceOnly?: boolean; cancelledOnly?: boolean;
}
export interface SubscriptionRow {
  orgId: string; orgName: string | null;
  plan: PlanTier; planCompat: PlanCompat;
  subscriptionStatus: SubscriptionStatus; billingState: BillingState; billingReason: string;
  provider: string | null; periodStart: string | null; periodEnd: string | null;
  trialEndsAt: string | null; graceUntil: string | null; cancelAtPeriodEnd: boolean;
  lastPaymentStatus: PaymentStatus | null; lastPaymentAt: string | null; lastPaymentVerified: boolean | null;
}

/**
 * List subscriptions with resolved billing state. Org names + latest payment
 * are batched (one `.in()` each) — no N+1. Filters applied in memory over the
 * resolved state. Cap: platform.billing.read. Audited once as subscriptions.list.
 */
export async function listPlatformSubscriptions(filters: SubscriptionFilters = {}): Promise<SubscriptionRow[]> {
  const operator = await assertPlatformCapability("platform.billing.read");
  const db = createServiceRoleClient();

  let subs: RawSubRow[] = [];
  try {
    const { data } = await db.from("subscriptions" as never).select(SUB_COLS).limit(5000);
    subs = ((data ?? []) as RawSubRow[]);
  } catch { subs = []; }
  if (subs.length === 0) {
    await writePlatformAudit({ operator, capability: "platform.billing.read", action: "subscriptions.list", resourceType: "platform", metadata: { count: 0 } });
    return [];
  }

  const orgIds = Array.from(new Set(subs.map((s) => s.org_id)));
  // Batch: org names + organizations.plan (for compat) in ONE query.
  const orgById = new Map<string, { name: string | null; plan: string | null }>();
  try {
    const { data } = await db.from("organizations").select("id,name,plan").in("id", orgIds);
    for (const o of ((data ?? []) as { id: string; name: string | null; plan: string | null }[])) orgById.set(o.id, { name: o.name, plan: o.plan });
  } catch { /* names degrade to null */ }

  // Batch: latest payment per org — ONE query, reduce newest-per-org in memory.
  const latestPayByOrg = new Map<string, RawPayRow>();
  try {
    const { data } = await db.from("payments" as never).select(PAY_COLS).in("org_id" as never, orgIds as never).order("created_at", { ascending: false }).limit(20000);
    for (const p of ((data ?? []) as RawPayRow[])) {
      if (p.org_id && !latestPayByOrg.has(p.org_id)) latestPayByOrg.set(p.org_id, p);
    }
  } catch { /* last-payment degrades to null */ }

  const rows: SubscriptionRow[] = subs.map((s) => {
    const org = orgById.get(s.org_id) ?? { name: null, plan: null };
    const lastPay = latestPayByOrg.get(s.org_id) ?? null;
    const { state, reason } = resolveBillingState(toSubInput(s), lastPay ? toPayInput(lastPay) : null);
    const compat = resolvePlanCompat({ subscriptionPlanTier: s.plan_tier, orgPlansPlan: null, organizationsPlan: org.plan });
    return {
      orgId: s.org_id, orgName: org.name,
      plan: compat.canonical, planCompat: compat,
      subscriptionStatus: s.status as SubscriptionStatus, billingState: state, billingReason: reason,
      provider: s.grow_subscription_id ? "grow" : null,
      periodStart: s.period_start, periodEnd: s.period_end, trialEndsAt: s.trial_ends_at, graceUntil: s.grace_until,
      cancelAtPeriodEnd: !!s.cancel_at_period_end,
      lastPaymentStatus: lastPay ? (lastPay.status as PaymentStatus) : null, lastPaymentAt: lastPay?.created_at ?? null,
      lastPaymentVerified: lastPay ? !!lastPay.verified : null,
    };
  });

  const filtered = rows.filter((r) => {
    if (filters.status && r.billingState !== filters.status) return false;
    if (filters.plan && r.plan !== filters.plan) return false;
    if (filters.trialOnly && r.billingState !== "TRIAL") return false;
    if (filters.graceOnly && r.billingState !== "GRACE") return false;
    if (filters.cancelledOnly && r.billingState !== "CANCELLED" && r.billingState !== "CANCEL_PENDING") return false;
    return true;
  });

  await writePlatformAudit({ operator, capability: "platform.billing.read", action: "subscriptions.list", resourceType: "platform", metadata: { count: filtered.length } });
  return filtered;
}

// ── Payments list (spec §5) ─────────────────────────────────────────────────
export interface PaymentFilters {
  status?: PaymentStatus | null;
  verified?: boolean | null;
  orgId?: string | null;
  since?: string | null; until?: string | null;
  limit?: number;
}
export interface PaymentRow {
  id: string; orgId: string | null; orgName: string | null;
  amountIls: number | null; currency: string | null; status: PaymentStatus;
  verified: boolean; verifiedAt: string | null; provider: string; planTier: string; createdAt: string;
}

/**
 * List payments with SAFE fields only (never signature / raw_payload / secrets).
 * Org names batched (one `.in()`). Cap: platform.billing.read. Audited once as
 * payments.list.
 */
export async function listPlatformPayments(filters: PaymentFilters = {}): Promise<PaymentRow[]> {
  const operator = await assertPlatformCapability("platform.billing.read");
  const db = createServiceRoleClient();
  const limit = Math.min(Math.max(filters.limit ?? 500, 1), 2000);

  let rows: RawPayRow[] = [];
  try {
    let q = db.from("payments" as never).select(PAY_COLS).order("created_at", { ascending: false }).limit(limit);
    if (filters.status) q = q.eq("status" as never, filters.status as never);
    if (typeof filters.verified === "boolean") q = q.eq("verified" as never, filters.verified as never);
    if (filters.orgId) q = q.eq("org_id" as never, filters.orgId as never);
    if (filters.since) q = q.gte("created_at" as never, filters.since as never);
    if (filters.until) q = q.lte("created_at" as never, filters.until as never);
    const { data } = await q;
    rows = ((data ?? []) as RawPayRow[]);
  } catch { rows = []; }

  const orgIds = Array.from(new Set(rows.map((r) => r.org_id).filter((x): x is string => !!x)));
  const nameById = new Map<string, string | null>();
  if (orgIds.length > 0) {
    try {
      const { data } = await db.from("organizations").select("id,name").in("id", orgIds);
      for (const o of ((data ?? []) as { id: string; name: string | null }[])) nameById.set(o.id, o.name);
    } catch { /* names degrade */ }
  }

  await writePlatformAudit({ operator, capability: "platform.billing.read", action: "payments.list", resourceType: "platform", metadata: { count: rows.length } });
  return rows.map((r) => ({
    id: r.id, orgId: r.org_id, orgName: r.org_id ? (nameById.get(r.org_id) ?? null) : null,
    amountIls: r.amount_ils, currency: r.currency, status: r.status as PaymentStatus,
    verified: !!r.verified, verifiedAt: r.verified_at, provider: r.provider, planTier: r.plan_tier, createdAt: r.created_at,
  }));
}

// ── Customer-360 billing detail (spec §6) ───────────────────────────────────
export interface OrgBillingDetail {
  orgId: string;
  planCompat: PlanCompat;
  subscription: SubscriptionRow | null;
  license: { plan: string | null; status: string | null; trialEndsAt: string | null; currentPeriodEnd: string | null } | null;
  billingState: BillingState; billingReason: string;
  recurringAmount: AvailableValue<number>;
  priceHintIls: number | null;
  payments: PaymentRow[];
  failedPaymentCount: number;
  provider: ProviderStatus;
}

/**
 * Full billing detail for ONE org (Customer 360 · Billing tab). Subscription +
 * license (org_plans) + safe payment history + resolved state + plan compat +
 * provider status. Read-only. Cap: platform.billing.read. Audited once as
 * customer360.billing_detail.
 */
export async function getOrgBillingDetail(orgId: string): Promise<OrgBillingDetail> {
  const operator = await assertPlatformCapability("platform.billing.read");
  const db = createServiceRoleClient();

  const [subRes, licRes, orgRes, payRes] = await Promise.all([
    db.from("subscriptions" as never).select(SUB_COLS).eq("org_id" as never, orgId as never).maybeSingle(),
    db.from("org_plans" as never).select("plan,status,trial_ends_at,current_period_end").eq("org_id" as never, orgId as never).maybeSingle(),
    db.from("organizations").select("name,plan").eq("id", orgId).maybeSingle(),
    db.from("payments" as never).select(PAY_COLS).eq("org_id" as never, orgId as never).order("created_at", { ascending: false }).limit(100),
  ]);

  const subRow = (subRes.data as RawSubRow | null) ?? null;
  const lic = (licRes.data as { plan: string | null; status: string | null; trial_ends_at: string | null; current_period_end: string | null } | null) ?? null;
  const org = (orgRes.data as { name: string | null; plan: string | null } | null) ?? null;
  const payRows = ((payRes.data ?? []) as RawPayRow[]);

  const compat = resolvePlanCompat({
    subscriptionPlanTier: subRow?.plan_tier ?? null,
    orgPlansPlan: lic?.plan ?? null,
    organizationsPlan: org?.plan ?? null,
  });
  const latestPay = payRows[0] ?? null;
  const { state, reason } = resolveBillingState(subRow ? toSubInput(subRow) : null, latestPay ? toPayInput(latestPay) : null);

  const payments: PaymentRow[] = payRows.map((r) => ({
    id: r.id, orgId: r.org_id, orgName: org?.name ?? null,
    amountIls: r.amount_ils, currency: r.currency, status: r.status as PaymentStatus,
    verified: !!r.verified, verifiedAt: r.verified_at, provider: r.provider, planTier: r.plan_tier, createdAt: r.created_at,
  }));

  const subscription: SubscriptionRow | null = subRow ? {
    orgId, orgName: org?.name ?? null, plan: compat.canonical, planCompat: compat,
    subscriptionStatus: subRow.status as SubscriptionStatus, billingState: state, billingReason: reason,
    provider: subRow.grow_subscription_id ? "grow" : null,
    periodStart: subRow.period_start, periodEnd: subRow.period_end, trialEndsAt: subRow.trial_ends_at, graceUntil: subRow.grace_until,
    cancelAtPeriodEnd: !!subRow.cancel_at_period_end,
    lastPaymentStatus: latestPay ? (latestPay.status as PaymentStatus) : null, lastPaymentAt: latestPay?.created_at ?? null,
    lastPaymentVerified: latestPay ? !!latestPay.verified : null,
  } : null;

  await writePlatformAudit({ operator, capability: "platform.billing.read", action: "customer360.billing_detail", resourceType: "organization", targetOrgId: orgId, metadata: { state, payments: payments.length } });

  return {
    orgId, planCompat: compat, subscription,
    license: lic ? { plan: lic.plan, status: lic.status, trialEndsAt: lic.trial_ends_at, currentPeriodEnd: lic.current_period_end } : null,
    billingState: state, billingReason: reason,
    recurringAmount: unavail(NO_RECURRING_SOURCE_REASON),
    priceHintIls: planDefinition(compat.canonical).priceHintIls,
    payments, failedPaymentCount: payments.filter((p) => p.status === "failed").length,
    provider: getGrowProviderStatus(),
  };
}
