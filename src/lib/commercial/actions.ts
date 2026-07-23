// ============================================================================
// 💳 ZONO OS 2.0 — Batch 6.4 · COMMERCIAL — wizard server actions.
//
// The registration wizard's server surface. State lives in a service-role draft
// keyed by an httpOnly capability cookie (resume support). The password is
// validated, encrypted (crypto.ts) and stored on the draft — never in plaintext,
// never used to create an auth identity before verified payment. The last step
// creates a PENDING payment and returns the Grow redirect. Activation happens
// only later, in the signed webhook.
// ============================================================================
"use server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { createDraft, getDraftByToken, saveDraft, createPayment, getPayment, emailTaken } from "./store";
import { validateStep, validateAll, type FieldError } from "./validation";
import { encryptSecret } from "./crypto";
import { planPriceIls } from "./plans";
import { buildGrowRedirect } from "./grow";
import { WIZARD_STEPS, type PlanTier, type RegistrationData, type RegistrationDraft, type WizardStepKey } from "./types";

const COOKIE = "zono_reg";
const stepIndex = (k: WizardStepKey) => WIZARD_STEPS.findIndex((s) => s.key === k);

async function tokenFromCookie(): Promise<string | null> {
  const c = await cookies();
  return c.get(COOKIE)?.value ?? null;
}

/** Load the current draft, or create a fresh one and set the cookie (resume). */
export async function ensureDraftAction(): Promise<RegistrationDraft | null> {
  const c = await cookies();
  const existing = c.get(COOKIE)?.value;
  if (existing) {
    const d = await getDraftByToken(existing);
    if (d && d.status !== "paid" && new Date(d.expiresAt) > new Date()) return d;
  }
  const token = randomBytes(24).toString("hex");
  const draft = await createDraft(token);
  if (draft) c.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 7 });
  return draft;
}

/** Save a non-owner step (validated). */
export async function saveStepAction(step: WizardStepKey, data: RegistrationData): Promise<{ errors: FieldError[] }> {
  const token = await tokenFromCookie();
  if (!token) return { errors: [{ field: "_", message: "פג תוקף הטיוטה — התחל מחדש." }] };
  const errors = validateStep(step, data);
  if (errors.length) return { errors };
  await saveDraft(token, { data, currentStep: stepIndex(step) + 1, planTier: data.planTier });
  return { errors: [] };
}

/** Save the owner step: validate password rules, check email uniqueness, and
 *  store the password ENCRYPTED on the draft (never plaintext). */
export async function saveOwnerAction(data: RegistrationData, password: string, passwordConfirm: string): Promise<{ errors: FieldError[] }> {
  const token = await tokenFromCookie();
  if (!token) return { errors: [{ field: "_", message: "פג תוקף הטיוטה — התחל מחדש." }] };
  const errors = validateStep("owner", data, { password, passwordConfirm });
  if (errors.length) return { errors };
  if (data.ownerEmail && (await emailTaken(data.ownerEmail))) {
    return { errors: [{ field: "ownerEmail", message: "כתובת האימייל כבר רשומה במערכת." }] };
  }
  const merged = { ...data, _encPassword: encryptSecret(password) } as unknown as RegistrationData;
  await saveDraft(token, { data: merged, email: data.ownerEmail, currentStep: stepIndex("owner") + 1 });
  return { errors: [] };
}

/** Finalize the wizard: validate everything, create a PENDING payment, and hand
 *  back the Grow redirect URL. NOTHING is activated here. */
export async function startPaymentAction(): Promise<{ url?: string; errors?: FieldError[] }> {
  const token = await tokenFromCookie();
  if (!token) return { errors: [{ field: "_", message: "פג תוקף הטיוטה — התחל מחדש." }] };
  const draft = await getDraftByToken(token);
  if (!draft) return { errors: [{ field: "_", message: "לא נמצאה טיוטה." }] };
  const errors = validateAll(draft.data);
  if (errors.length) return { errors };
  const tier: PlanTier = draft.data.planTier ?? "starter";
  const amount = planPriceIls(tier) ?? 0;
  const payment = await createPayment({ draftId: draft.id, planTier: tier, amountIls: amount });
  if (!payment) return { errors: [{ field: "_", message: "תקלה ביצירת תשלום." }] };
  await saveDraft(token, { status: "submitted", planTier: tier });
  const redirect = buildGrowRedirect({ paymentId: payment.id, amountIls: amount, planTier: tier, email: draft.email });
  return { url: redirect.url };
}

/** Poll a payment's state for the status page (reflects VERIFIED state only). */
export async function paymentStatusAction(paymentId: string): Promise<{ status: string; verified: boolean; activated: boolean }> {
  const p = await getPayment(paymentId);
  if (!p) return { status: "unknown", verified: false, activated: false };
  return { status: p.status, verified: p.verified, activated: !!p.orgId };
}
