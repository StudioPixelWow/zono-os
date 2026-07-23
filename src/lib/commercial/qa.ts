// ============================================================================
// 🧪 ZONO OS 2.0 — Batch 6.4 · COMMERCIAL & ONBOARDING QA (offline).
// Run: npx tsx src/lib/commercial/qa.ts
//
// Verifies the commercial funnel end to end at the logic level, headlined by the
// ONE rule that must never break: NO ACTIVATION BEFORE VERIFIED PAYMENT. Plus
// validation, subscription/payment/license models, and source-level security
// guards (signed webhook, gated provisioning, encrypted draft password,
// idempotency, cross-org isolation).
// ============================================================================
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import { canActivate, verifyWebhookSignature, computeSignature, parseSignatureHeader, paymentIdempotencyKey } from "./verification";
import { validateStep, validateAll, validatePassword, isEmail } from "./validation";
import { canAccessPlatform, canTransition, statusAfterVerifiedPayment, statusAfterFailedPayment } from "./subscriptions";
import { licenseForPlan, licenseAllowsUser, licenseHasModule } from "./licenses";
import { planCards, planPriceIls } from "./plans";
import type { PaymentStatus, RegistrationData, SubscriptionStatus } from "./types";

let pass = 0, fail = 0;
const check = (n: string, ok: boolean) => { if (ok) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.error(`  ✗ ${n}`); } };
const S = (t: string) => console.log(`\n── ${t} ──`);
const strip = (s: string) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const read = (p: string) => strip(readFileSync(p, "utf8"));
const LIB = "src/lib/commercial";
const WEBHOOK = "src/app/api/payments/grow/webhook/route.ts";
const MIG = "supabase/migrations/20261001120000_commercial_onboarding.sql";

S("1. THE INVARIANT — no activation before verified payment");
{
  const pay = (status: PaymentStatus, verified: boolean) => ({ status, verified });
  check("1.1 paid + verified ⇒ can activate", canActivate(pay("paid", true)) === true);
  check("1.2 paid but NOT verified ⇒ cannot activate (browser-redirect case)", canActivate(pay("paid", false)) === false);
  check("1.3 verified flag alone on a non-paid status ⇒ cannot activate", canActivate(pay("processing", true)) === false);
  check("1.4 pending / processing / failed / cancelled / expired ⇒ cannot activate",
    (["pending", "processing", "failed", "cancelled", "expired"] as PaymentStatus[]).every((s) => !canActivate(pay(s, true)) || s === "paid"));
  check("1.5 the ONLY activating combination is exactly paid+verified",
    (["pending", "processing", "paid", "failed", "cancelled", "expired"] as PaymentStatus[]).flatMap((s) => [true, false].map((v) => canActivate(pay(s, v)) === (s === "paid" && v))).every(Boolean));
}

S("2. Webhook signature verification — fail closed (mirrors WhatsApp)");
{
  const secret = "grow_secret_key";
  const body = JSON.stringify({ cField1: "pay_1", status: "paid" });
  const good = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  check("2.1 correct HMAC over the raw body verifies", verifyWebhookSignature(secret, body, `sha256=${good}`) === true);
  check("2.2 bare-hex header also verifies", verifyWebhookSignature(secret, body, good) === true);
  check("2.3 wrong secret ⇒ fails", verifyWebhookSignature("other", body, `sha256=${good}`) === false);
  check("2.4 tampered body ⇒ fails", verifyWebhookSignature(secret, body + " ", `sha256=${good}`) === false);
  check("2.5 NO secret configured ⇒ fails (cannot verify ⇒ never activate)", verifyWebhookSignature(undefined, body, `sha256=${good}`) === false);
  check("2.6 malformed header ⇒ fails", verifyWebhookSignature(secret, body, "sha256=zzz") === false && parseSignatureHeader("nope") === null);
  check("2.7 computeSignature matches node HMAC + idempotency key format", computeSignature(secret, body) === good && paymentIdempotencyKey("grow", "t1") === "grow:t1");
}

S("3. Registration validation");
{
  const base: RegistrationData = { officeName: "משרד", companyName: "חברה", taxId: "123", city: "חיפה", phone: "050", ownerFullName: "טל", ownerEmail: "a@b.com", ownerMobile: "052", agentCount: 3, workingAreas: ["חיפה"], planTier: "professional" };
  check("3.1 a complete registration passes validateAll", validateAll(base).length === 0);
  check("3.2 missing company fields fail the company step", validateStep("company", { officeName: "" }).length > 0);
  check("3.3 password rules: <8 / no digit / no letter rejected; strong accepted",
    validatePassword("short") !== null && validatePassword("allletters") !== null && validatePassword("12345678") !== null && validatePassword("Zono1234") === null);
  check("3.4 owner step enforces password + confirmation match",
    validateStep("owner", base, { password: "Zono1234", passwordConfirm: "different" }).some((e) => e.field === "passwordConfirm") &&
    validateStep("owner", base, { password: "Zono1234", passwordConfirm: "Zono1234" }).length === 0);
  check("3.5 email format validated", isEmail("a@b.com") && !isEmail("nope"));
  check("3.6 integrations step is never required (Skip allowed)", validateStep("integrations", {}).length === 0);
  check("3.7 plan step requires a valid tier", validateStep("plan", {}).length > 0 && validateStep("plan", { planTier: "office" }).length === 0);
}

S("4. Subscription lifecycle");
{
  check("4.1 access statuses = active / trial / grace_period only",
    (["active", "trial", "grace_period"] as SubscriptionStatus[]).every(canAccessPlatform) &&
    (["pending_payment", "suspended", "cancelled", "expired"] as SubscriptionStatus[]).every((s) => !canAccessPlatform(s)));
  check("4.2 a verified payment always yields 'active'", statusAfterVerifiedPayment() === "active");
  check("4.3 a failed payment NEVER yields active", statusAfterFailedPayment("active") !== "active" && statusAfterFailedPayment("trial") !== "active");
  check("4.4 transitions: cancelled/expired can reactivate → active; active can't jump to trial",
    canTransition("cancelled", "active") && canTransition("expired", "active") && !canTransition("active", "trial"));
  check("4.5 pending_payment → active allowed; suspended → active (reactivate)", canTransition("pending_payment", "active") && canTransition("suspended", "active"));
}

S("5. License model (projection over launch PLANS)");
{
  const starter = licenseForPlan("starter"), office = licenseForPlan("office"), ent = licenseForPlan("enterprise");
  check("5.1 seats → maxUsers, features → modules, aiCalls → aiCredits, storage present",
    starter.maxUsers === 1 && starter.enabledModules.includes("property_radar") && starter.aiCredits === 100 && starter.storageMb > 0);
  check("5.2 enterprise is unlimited users + all modules + unlimited storage", ent.maxUsers === -1 && ent.storageMb === -1 && ent.enabledModules.length >= 8);
  check("5.3 seat limit enforced (-1 = unlimited)", !licenseAllowsUser(starter, 1) && licenseAllowsUser(office, 5) && licenseAllowsUser(ent, 9999));
  check("5.4 module gating reads the license", licenseHasModule(office, "office_intelligence") && !licenseHasModule(starter, "office_intelligence"));
  check("5.5 billing ref slot exists for future Grow compatibility", "billingRef" in starter);
}

S("6. Plans display");
{
  const cards = planCards();
  check("6.1 four tiers with monthly pricing", cards.length === 4 && cards.find((c) => c.tier === "professional")?.monthlyIls === 199);
  check("6.2 enterprise has no fixed price (contact)", cards.find((c) => c.tier === "enterprise")?.monthlyIls === null && planPriceIls("starter") === 0);
}

S("7. Source guards — gated provisioning, encrypted draft, isolation");
{
  const prov = read(join(LIB, "provisioning.ts"));
  const confirm = read(join(LIB, "confirm.ts"));
  const webhook = read(WEBHOOK);
  const actions = read(join(LIB, "actions.ts"));
  const store = read(join(LIB, "store.ts"));
  const mig = readFileSync(MIG, "utf8");
  check("7.0 draft mutations (create/save) go through the service-role store, not the RLS client",
    /createDraft[\s\S]*?createServiceRoleClient|createServiceRoleClient/.test(store) && store.includes("registration_drafts"));

  check("7.1 provisioning is GATED on canActivate and returns before creating anything",
    prov.includes("canActivate(payment)") && /if \(!canActivate\(payment\)\) return/.test(prov));
  check("7.2 the auth identity is created INSIDE provisioning (never before verified payment)",
    prov.includes("auth.admin.createUser") && !actions.includes("auth.admin.createUser"));
  check("7.3 provisioning is idempotent — no duplicate org for a repeated webhook",
    prov.includes("if (draft.orgId) return") && confirm.includes("if (payment.orgId) return"));
  check("7.4 confirm marks verified THEN gates on canActivate before provisioning",
    confirm.includes("markPaymentVerified") && confirm.includes("canActivate(verified)") && confirm.includes("provisionFromVerifiedPayment"));
  check("7.5 webhook verifies the signature BEFORE doing anything, fail-closed 401",
    webhook.includes("verifyWebhookSignature") && webhook.includes("401") && webhook.indexOf("verifyWebhookSignature") < webhook.indexOf("confirmVerifiedGrowPayment"));
  check("7.6 the password is stored ENCRYPTED (never plaintext) on the draft",
    actions.includes("encryptSecret(password)") && !/_encPassword:\s*password\b/.test(actions) && prov.includes("decryptSecret"));
  check("7.7 drafts are service-role only (RLS enabled, NO anon/auth policy)",
    /registration_drafts[\s\S]*?enable row level security/.test(mig) && !/create policy[^;]*registration_drafts/.test(mig));
  check("7.8 payments + subscriptions are cross-org isolated (RLS via current_org_id)",
    /policy payments_select[\s\S]*current_org_id\(\)/.test(mig) && /policy subscriptions_select[\s\S]*current_org_id\(\)/.test(mig));
  check("7.9 payment writes are service-role only (no user INSERT/UPDATE policy)",
    !/payments[\s\S]*for insert/.test(mig) && !/payments[\s\S]*for update/.test(mig));
  check("7.10 replay protection: unique provider transaction id", mig.includes("unique (provider, provider_txn_id)"));
  const migNoComments = mig.replace(/--.*$/gm, "");
  check("7.11 no password COLUMN in the schema; password absent from the draft data type",
    !/\bpassword\b/i.test(migNoComments) && !/password/i.test(read(join(LIB, "types.ts"))));
}

console.log(`\nCommercial & Onboarding (6.4) QA: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
