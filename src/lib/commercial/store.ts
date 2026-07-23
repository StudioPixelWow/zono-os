// ============================================================================
// 💳 ZONO OS 2.0 — Batch 6.4 · COMMERCIAL — storage (server, service-role).
//
// Append/read access to registration_drafts / payments / subscriptions. Drafts
// and payment writes are service-role only (the registrant is pre-auth; the
// webhook has no session), keyed by capability token / verified transaction.
// Reads for self-service go through the RLS client so org isolation holds.
// ============================================================================
import "server-only";
import { createServiceRoleClient, createClient } from "@/lib/supabase/server";
import type { PlanTier } from "@/lib/launch/types";
import type {
  Payment, PaymentStatus, RegistrationData, RegistrationDraft, DraftStatus,
  Subscription, SubscriptionStatus,
} from "./types";

// Rows are accessed via `as never` casts — these tables mirror the Phase-21
// convention (not in the generated Database union). Local row shapes keep the
// mappers typed.
interface DraftRow { id: string; token: string; email: string | null; auth_user_id: string | null; org_id: string | null; status: string; current_step: number; plan_tier: string | null; data: RegistrationData; expires_at: string }
interface PaymentRow { id: string; draft_id: string | null; org_id: string | null; provider: string; provider_txn_id: string | null; plan_tier: string; amount_ils: number; currency: string; status: string; verified: boolean; verified_at: string | null; created_at: string }
interface SubRow { org_id: string; plan_tier: string; status: string; period_start: string | null; period_end: string | null; trial_ends_at: string | null; grace_until: string | null; grow_subscription_id: string | null; cancel_at_period_end: boolean }

const toDraft = (r: DraftRow): RegistrationDraft => ({
  id: r.id, token: r.token, email: r.email, authUserId: r.auth_user_id, orgId: r.org_id,
  status: r.status as DraftStatus, currentStep: r.current_step, planTier: (r.plan_tier as PlanTier | null) ?? null,
  data: r.data ?? {}, expiresAt: r.expires_at,
});
const toPayment = (r: PaymentRow): Payment => ({
  id: r.id, draftId: r.draft_id, orgId: r.org_id, provider: r.provider, providerTxnId: r.provider_txn_id,
  planTier: r.plan_tier as PlanTier, amountIls: Number(r.amount_ils), currency: r.currency,
  status: r.status as PaymentStatus, verified: r.verified === true, verifiedAt: r.verified_at, createdAt: r.created_at,
});
const toSub = (r: SubRow): Subscription => ({
  orgId: r.org_id, planTier: r.plan_tier as PlanTier, status: r.status as SubscriptionStatus,
  periodStart: r.period_start, periodEnd: r.period_end, trialEndsAt: r.trial_ends_at, graceUntil: r.grace_until,
  growSubscriptionId: r.grow_subscription_id, cancelAtPeriodEnd: r.cancel_at_period_end === true,
});

// ── Registration drafts ─────────────────────────────────────────────────────
export async function createDraft(token: string): Promise<RegistrationDraft | null> {
  const db = createServiceRoleClient();
  const { data, error } = await db.from("registration_drafts" as never).insert({ token, status: "draft", current_step: 1, data: {} } as never).select("*").maybeSingle();
  if (error || !data) return null;
  return toDraft(data as unknown as DraftRow);
}
export async function getDraftByToken(token: string): Promise<RegistrationDraft | null> {
  const db = createServiceRoleClient();
  const { data } = await db.from("registration_drafts" as never).select("*").eq("token", token).maybeSingle();
  return data ? toDraft(data as unknown as DraftRow) : null;
}
export async function getDraftById(id: string): Promise<RegistrationDraft | null> {
  const db = createServiceRoleClient();
  const { data } = await db.from("registration_drafts" as never).select("*").eq("id", id).maybeSingle();
  return data ? toDraft(data as unknown as DraftRow) : null;
}

/** Best-effort email-uniqueness check against ACTIVATED users (Part 8). The
 *  authoritative uniqueness check is Supabase auth at provisioning. */
export async function emailTaken(email: string): Promise<boolean> {
  const db = createServiceRoleClient();
  const { data } = await db.from("users").select("id").eq("email", email).maybeSingle();
  return !!data;
}
export async function saveDraft(token: string, patch: { data?: RegistrationData; currentStep?: number; planTier?: PlanTier; email?: string; authUserId?: string; status?: DraftStatus; orgId?: string }): Promise<RegistrationDraft | null> {
  const db = createServiceRoleClient();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.data !== undefined) row.data = patch.data;
  if (patch.currentStep !== undefined) row.current_step = patch.currentStep;
  if (patch.planTier !== undefined) row.plan_tier = patch.planTier;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.authUserId !== undefined) row.auth_user_id = patch.authUserId;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.orgId !== undefined) row.org_id = patch.orgId;
  const { data, error } = await db.from("registration_drafts" as never).update(row as never).eq("token", token).select("*").maybeSingle();
  if (error || !data) return null;
  return toDraft(data as unknown as DraftRow);
}

// ── Payments ────────────────────────────────────────────────────────────────
export async function createPayment(input: { draftId: string; planTier: PlanTier; amountIls: number }): Promise<Payment | null> {
  const db = createServiceRoleClient();
  const { data, error } = await db.from("payments" as never).insert({ draft_id: input.draftId, plan_tier: input.planTier, amount_ils: input.amountIls, status: "pending", provider: "grow" } as never).select("*").maybeSingle();
  if (error || !data) return null;
  return toPayment(data as unknown as PaymentRow);
}
export async function getPayment(id: string): Promise<Payment | null> {
  const db = createServiceRoleClient();
  const { data } = await db.from("payments" as never).select("*").eq("id", id).maybeSingle();
  return data ? toPayment(data as unknown as PaymentRow) : null;
}
/** Mark a payment VERIFIED (paid) — only the signed webhook calls this. */
export async function markPaymentVerified(id: string, providerTxnId: string, signature: string, rawPayload: unknown): Promise<Payment | null> {
  const db = createServiceRoleClient();
  const { data, error } = await db.from("payments" as never)
    .update({ status: "paid", verified: true, verified_at: new Date().toISOString(), provider_txn_id: providerTxnId, signature, raw_payload: rawPayload, updated_at: new Date().toISOString() } as never)
    .eq("id", id).select("*").maybeSingle();
  if (error || !data) return null;
  return toPayment(data as unknown as PaymentRow);
}
export async function setPaymentStatus(id: string, status: PaymentStatus): Promise<void> {
  const db = createServiceRoleClient();
  await db.from("payments" as never).update({ status, updated_at: new Date().toISOString() } as never).eq("id", id);
}
export async function linkPaymentToOrg(id: string, orgId: string): Promise<void> {
  const db = createServiceRoleClient();
  await db.from("payments" as never).update({ org_id: orgId, updated_at: new Date().toISOString() } as never).eq("id", id);
}
/** Self-service payment history — RLS-scoped (org managers only). */
export async function listOrgPayments(): Promise<Payment[]> {
  const db = await createClient();
  const { data } = await db.from("payments" as never).select("*").order("created_at", { ascending: false }).limit(50);
  return ((data as unknown as PaymentRow[]) ?? []).map(toPayment);
}

// ── Subscriptions ───────────────────────────────────────────────────────────
export async function upsertSubscription(sub: { orgId: string; planTier: PlanTier; status: SubscriptionStatus; periodStart?: string | null; periodEnd?: string | null; growSubscriptionId?: string | null; cancelAtPeriodEnd?: boolean }): Promise<void> {
  const db = createServiceRoleClient();
  await db.from("subscriptions" as never).upsert({
    org_id: sub.orgId, plan_tier: sub.planTier, status: sub.status,
    period_start: sub.periodStart ?? null, period_end: sub.periodEnd ?? null,
    grow_subscription_id: sub.growSubscriptionId ?? null,
    cancel_at_period_end: sub.cancelAtPeriodEnd ?? false, updated_at: new Date().toISOString(),
  } as never, { onConflict: "org_id" } as never);
}
export async function getSubscription(): Promise<Subscription | null> {
  const db = await createClient();
  const { data } = await db.from("subscriptions" as never).select("*").maybeSingle();
  return data ? toSub(data as unknown as SubRow) : null;
}
