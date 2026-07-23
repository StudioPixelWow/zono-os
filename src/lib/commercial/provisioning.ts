// ============================================================================
// 💳 ZONO OS 2.0 — Batch 6.4 · COMMERCIAL — provisioning pipeline (server).
//
// Runs the "Post Payment" sequence — and ONLY after a VERIFIED payment. It
// mirrors the existing completeOnboarding provisioning (createOrganizationWith
// Roles → getRoleIdByKey("owner") → provisionUserProfile) and reuses the launch
// plan repository for the license. It is idempotent (a second verified webhook
// for the same draft returns the already-created org).
//
//   canActivate(payment) === false  ⇒  NOTHING is created. Full stop.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { createOrganizationWithRoles, getRoleIdByKey } from "@/lib/repositories/organizationRepository";
import { provisionUserProfile } from "@/lib/repositories/userRepository";
import { createLaunchRepository } from "@/lib/launch/server/repository";
import { defaultLimits } from "@/lib/launch/plans";
import { canActivate } from "./verification";
import { statusAfterVerifiedPayment } from "./subscriptions";
import { upsertSubscription, linkPaymentToOrg, saveDraft } from "./store";
import { sendWelcomeEmail } from "./email";
import { decryptSecret } from "./crypto";
import type { Payment, PlanTier, RegistrationDraft } from "./types";

export interface ProvisionResult { ok: boolean; orgId?: string; reason?: string }

/**
 * Activate an account from a verified payment. Every guard fails CLOSED: an
 * unverified payment, a missing auth identity, or an expired draft creates
 * nothing.
 */
export async function provisionFromVerifiedPayment(payment: Payment, draft: RegistrationDraft): Promise<ProvisionResult> {
  // ── THE GATE ──────────────────────────────────────────────────────────────
  if (!canActivate(payment)) return { ok: false, reason: "payment_not_verified" };
  // Idempotent: a repeated verified webhook must not create a second org.
  if (draft.orgId) return { ok: true, orgId: draft.orgId };

  const d = draft.data;
  const tier: PlanTier = draft.planTier ?? "starter";
  const ownerEmail = draft.email ?? d.ownerEmail ?? "";
  const admin = createServiceRoleClient();

  // 0. Create the auth identity NOW (never before verified payment) from the
  //    encrypted password captured at registration. If one already exists from
  //    a prior partial run, reuse it (idempotency).
  let authUserId = draft.authUserId;
  if (!authUserId) {
    const encPw = (d as Record<string, unknown>)._encPassword;
    if (typeof encPw !== "string") return { ok: false, reason: "no_credential" };
    let password: string;
    try { password = decryptSecret(encPw); } catch { return { ok: false, reason: "credential_unreadable" }; }
    const created = await admin.auth.admin.createUser({
      email: ownerEmail, password, email_confirm: true,
      user_metadata: { full_name: d.ownerFullName ?? "" },
    });
    if (created.error || !created.data.user) return { ok: false, reason: "auth_create_failed" };
    authUserId = created.data.user.id;
    await saveDraft(draft.token, { authUserId, email: ownerEmail });
  }

  // 1. Create Organization (+ seed default roles)
  const org = await createOrganizationWithRoles({
    name: (d.officeName || d.companyName || "Organization").trim(),
    phone: d.phone ?? null,
    email: ownerEmail || null,
    city: d.city ?? null,
    logo_url: d.logoUrl ?? null,
    operating_cities: d.workingAreas ?? [],
    operating_neighborhoods: [],
    onboarding_completed: false,          // first-login checklist still to do
  });

  // 2. Create Owner User (link the auth identity → owner role)
  const roleId = await getRoleIdByKey(org.id, "owner");
  await provisionUserProfile({
    id: authUserId, org_id: org.id, role_id: roleId,
    email: ownerEmail, full_name: (d.ownerFullName || "בעלים").trim(),
    phone: d.ownerMobile ?? null, status: "active", onboarding_completed: false,
  });

  // 3. Assign License (reuse the launch plan record — org_plans)
  await createLaunchRepository(admin).upsertPlan(org.id, tier, "active", defaultLimits(tier), authUserId);

  // 4. Assign Subscription (active — verified)
  await upsertSubscription({
    orgId: org.id, planTier: tier, status: statusAfterVerifiedPayment(),
    periodStart: new Date().toISOString(), growSubscriptionId: payment.providerTxnId,
  });

  // 5. Link draft + payment to the new org (Create Workspace / Default Settings
  //    are satisfied by the org record + seeded roles + org_plans limits).
  await saveDraft(draft.token, { status: "paid", orgId: org.id });
  await linkPaymentToOrg(payment.id, org.id);

  // 6. Create Audit Record (service-role — no session user in the webhook path)
  await admin.from("audit_log").insert({
    organization_id: org.id, actor_id: authUserId, actor_name: d.ownerFullName ?? "בעלים",
    action: "commercial.account.activated", category: "configuration",
    entity_type: "organization", entity_id: org.id,
    summary: `הופעל חשבון (${tier}) לאחר תשלום מאומת`, metadata: { paymentId: payment.id, tier } as never,
  } as never).then(() => undefined, () => undefined);

  // 7. Send Welcome Email (best-effort; provider wired later)
  await sendWelcomeEmail(ownerEmail, d.ownerFullName ?? "").catch(() => undefined);

  return { ok: true, orgId: org.id };
}
