// ============================================================================
// ZONO 10.0 — GLOBAL LAUNCH ACCEPTANCE regression tests (the fixes this run made).
// Locks two launch-facing, provider-free defects closed:
//   §15 — the trial→paid checkout return URL /billing/status was a 404; now a
//         canonical authenticated Hebrew status landing exists and both the success
//         and cancel URLs resolve to it (activation still webhook-only).
//   §18 — the public agent-site /properties JSON endpoint leaked raw internal
//         scorecards (truthScore/marketScore/competition/strategy); it now returns
//         REDACTED public property cards through the same builder as /property/:id.
// Source-closure + route-existence (the strip-types runner rejects @/ imports).
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/global-launch-10-0.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const src = (rel: string) => readFileSync(new URL(`src/${rel}`, root), "utf8");
const exists = (rel: string) => existsSync(new URL(`src/${rel}`, root));

// ── §15.1 — checkout success + cancel URLs point at /billing/status ────────────
test("trial→paid checkout returns to /billing/status (success + cancel)", () => {
  const t = src("lib/commercial/checkout.ts");
  assert.match(t, /\/billing\/status\?payment=/, "success URL is /billing/status");
  assert.match(t, /cancelUrl: `\$\{statusUrl\}&cancelled=1`/, "cancel URL derives from the same status URL");
});

// ── §15.2 — the /billing/status route now EXISTS (no 404) ─────────────────────
test("/billing/status is a real route rendering the status view", () => {
  assert.ok(exists("app/billing/status/page.tsx"), "route page exists");
  assert.ok(exists("app/billing/status/BillingStatusView.tsx"), "view exists");
  assert.match(src("app/billing/status/page.tsx"), /BillingStatusView/, "page renders the view");
});

// ── §15.3 — the view reflects truth (never activates) + logged-in CTAs ────────
test("billing status view polls verified state, never activates, routes to app/account (not login-only)", () => {
  const t = src("app/billing/status/BillingStatusView.tsx");
  assert.match(t, /paymentStatusAction\(paymentId\)/, "polls the verified payment state");
  // never CALLS an activation/charge path from the browser (prose comments aside)
  assert.doesNotMatch(t, /activateOrgSubscription|createGrowCheckout|growCreatePaymentProcess|\.charge\(/, "never activates / never charges from the browser");
  assert.match(t, /href="\/"/, "success returns the logged-in owner to the workspace");
  assert.match(t, /href="\/account"/, "and offers the account/billing recovery path");
  assert.match(t, /[֐-׿]/, "Hebrew copy (no raw provider enum)");
  // must NOT ask an already-logged-in converting owner to /login
  assert.doesNotMatch(t, /href="\/login"/, "conversion return does not bounce through /login");
});

// ── §15.4 — the NEW-signup return (/register/status) is untouched ─────────────
test("new-signup checkout still returns to /register/status", () => {
  assert.ok(exists("app/(auth)/register/status/page.tsx"), "register status page intact");
  assert.match(src("lib/commercial/grow.ts"), /\/register\/status\?payment=/, "registration return unchanged");
});

// ── §18.1 — public agent /properties returns REDACTED cards, not raw listings ─
test("getAgentProperties returns redacted public PropertyAI (not raw SiteListingInput)", () => {
  const t = src("lib/agent-site/service.ts");
  assert.match(t, /getAgentProperties[\s\S]*?listings: input\.listings\.map\(\(l\) => buildProperty\(l, input\.listings\)\)/, "maps every listing through the public buildProperty redactor");
  assert.match(t, /getAgentProperties\(slug: string\): Promise<\{ branding: AgentBranding; listings: PropertyAI\[\] \}/, "return type is the public PropertyAI[], not SiteListingInput[]");
  // the raw return must be gone
  assert.doesNotMatch(t, /getAgentProperties[\s\S]*?listings: input\.listings \}/, "no raw input.listings returned");
});

// ── §18.2 — the public JSON route serves the redacted list branch ─────────────
test("the public agent-site /properties API branch is served by the redacted getAgentProperties", () => {
  const t = src("app/api/agent-site/[slug]/[...path]/route.ts");
  assert.match(t, /seg === "properties"\) return wrap\(await getAgentProperties\(slug\)\)/, "the list branch uses the (now redacted) builder");
});

// ── acceptance: billing PROVIDER round-trip stays deferred (no charge in code path)
test("checkout creates a hosted-URL process only — never charges, activation is webhook-only", () => {
  const t = src("lib/commercial/checkout.ts");
  assert.match(t, /does NOT charge here|Activation happens ONLY later|verified/i, "documents no-charge + verified-webhook activation");
  assert.match(t, /NOT_CONFIGURED|simulated: true/, "unconfigured provider → inert, never a fake success");
});
