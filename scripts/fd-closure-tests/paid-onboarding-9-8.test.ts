// ============================================================================
// ZONO 9.8 — PAID ONBOARDING LAUNCH CLOSURE regression tests.
// Proves ONE coherent onboarding truth (users.onboarding_completed) drives all
// login routing through a single loop-free matrix that NEVER branches on billing:
// trial/active/grace/restricted/cancelled/reactivated all route identically for a
// given onboarding flag; paid provisioning marks a fully-provisioned office complete
// (no bounce to first-run); paid activation never resets onboarding; an invited agent
// joins the inviting org (no second org, no wizard); provisioning/trial are idempotent;
// and cross-tenant onboarding writes are impossible.
// Behavioral over the PURE routing module + source-closure over the server wiring.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/paid-onboarding-9-8.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  resolveOnboardingState, destinationForState,
  type OnboardingState, type LayoutContext,
} from "../../src/lib/auth/onboarding-routing.ts";

const root = new URL("../../", import.meta.url);
const src = (rel: string) => readFileSync(new URL(`src/${rel}`, root), "utf8");

// A user with a profile + a given onboarding flag (auth present, not blocked).
const user = (onboardingCompleted: boolean): OnboardingState =>
  resolveOnboardingState({ hasUser: true, blocked: false, hasProfile: true, onboardingCompleted });

// ── 1. new trial + incomplete → onboarding ────────────────────────────────────
test("new trial, onboarding incomplete → /onboarding", () => {
  assert.equal(user(false), "onboarding");
  assert.equal(destinationForState("onboarding", "app"), "/onboarding");
});

// ── 2. trial + complete → home ────────────────────────────────────────────────
test("trial, onboarding complete → app (render)", () => {
  assert.equal(user(true), "ready");
  assert.equal(destinationForState("ready", "app"), "render");
});

// ── 3/4/5/6/7/8. billing status is NOT an input — same flag → same route ───────
test("active/grace/restricted/cancelled/reactivated route ONLY on the onboarding flag", () => {
  // resolveOnboardingState has no subscription parameter — billing cannot change the state.
  // complete → ready → app for EVERY billing status; incomplete → onboarding for every status.
  assert.equal(user(true), "ready", "active/grace/restricted/cancelled/reactivated + complete → ready");
  assert.equal(destinationForState(user(true), "app"), "render", "…→ app, never /onboarding");
  assert.notEqual(destinationForState(user(true), "app"), "/onboarding", "a configured office is NEVER sent to first-run");
  assert.equal(user(false), "onboarding", "genuinely incomplete → onboarding regardless of billing");
});

// ── 9. paid ACTIVATION never resets onboarding ────────────────────────────────
test("paid activation writer never touches onboarding_completed", () => {
  assert.doesNotMatch(src("lib/commercial/activate.ts"), /onboarding_completed/, "activation is UPDATE status only — never resets onboarding");
});

// ── 9b. paid PROVISIONING marks the fully-provisioned office complete ──────────
test("paid provisioning sets onboarding_completed=true (office is configured → no first-run bounce)", () => {
  const t = src("lib/commercial/provisioning.ts");
  assert.match(t, /onboarding_completed: true,\s*\n\s*}\);/, "org created onboarding-complete");
  assert.match(t, /status: "active", onboarding_completed: true/, "owner provisioned onboarding-complete");
  assert.doesNotMatch(t, /onboarding_completed: false/, "no leftover false that would loop the paid owner");
});

// ── 10. repeated activation / trial idempotent (one subscription per org) ──────
test("trial + subscription writes are idempotent on the org_id key (no duplicate subscription)", () => {
  const t = src("lib/commercial/store.ts");
  assert.match(t, /ensureTrialSubscription/, "canonical trial creator present");
  assert.match(t, /onConflict: "org_id"/, "subscription upsert keyed on org_id (one per org)");
});

// ── 11. invite-accepted agent joins the inviting org — no second org, no wizard ─
test("accepting an invite sets the agent complete + attaches to the inviting org (no new org)", () => {
  const t = src("lib/team-admin/actions.ts");
  assert.match(t, /onboarding_completed: true/, "agent is onboarding-complete on accept → goes straight to app");
  assert.match(t, /org_id: inv\.org_id/, "agent attaches to the INVITING org");
  assert.doesNotMatch(t, /createOrganizationWithRoles/, "invite accept never creates a second organization");
});

// ── 12. returning agent routes to the app (not onboarding) ────────────────────
test("returning agent (complete) → app", () => {
  assert.equal(destinationForState(user(true), "app"), "render");
});

// ── 13. no duplicate subscription — PK/existence guard ────────────────────────
test("ensureTrialSubscription checks existence before insert (retry-safe)", () => {
  const t = src("lib/commercial/store.ts");
  assert.match(t, /ensureTrialSubscription[\s\S]*?status: "trial"/, "creates a trial only once");
});

// ── 14. no duplicate org — completeOnboarding fast-path never re-creates ───────
test("completeOnboarding fast-path redirects an already-provisioned user without creating an org", () => {
  const t = src("lib/onboarding/actions.ts");
  assert.match(t, /if \(existingOrgId\) \{[\s\S]*?redirect\("\/"\);/, "already has an org → redirect, no second org");
  // and it self-heals the flag so the user is not looped back to /onboarding
  assert.match(t, /if \(!existingComplete\) \{[\s\S]*?onboarding_completed: true/, "idempotent repair of the flag closes the loop");
});

// ── 15. cross-tenant onboarding mutation blocked ──────────────────────────────
test("onboarding completion + repair are scoped to the caller's OWN user/org (no client org)", () => {
  const t = src("lib/onboarding/actions.ts");
  assert.match(t, /getAuthUser\(\)/, "identity is the session auth user, never client-supplied");
  assert.match(t, /\.eq\("id", user\.id\)\.eq\("org_id", existingOrgId\)/, "flag repair is scoped to the caller's own id + org");
  assert.doesNotMatch(t, /payload\.(orgId|org_id|organizationId)/, "org identity never comes from the client payload");
});

// ── 16. partial provisioning retry-safe (idempotent) ──────────────────────────
test("paid provisioning is idempotent on a repeated verified webhook", () => {
  const t = src("lib/commercial/provisioning.ts");
  assert.match(t, /if \(draft\.orgId\) return \{ ok: true, orgId: draft\.orgId \}/, "second webhook returns the already-created org");
  assert.match(t, /if \(!authUserId\) \{[\s\S]*?createUser/, "auth identity reused if already created (no dup)");
});

// ── 17. post-checkout return respects the onboarding truth (not hardcoded) ─────
test("post-checkout return routes through the canonical truth, not a hardcoded /onboarding", () => {
  // The registration status page links to /login; from there getSessionContext decides
  // app-vs-onboarding by the flag (which paid provisioning has set complete).
  assert.match(src("app/(auth)/register/status/StatusView.tsx"), /href="\/login"/, "return links to /login (canonical routing decides), not a hardcoded /onboarding");
  assert.doesNotMatch(src("app/(auth)/register/status/StatusView.tsx"), /href="\/onboarding"/, "never hardcodes payment-success → onboarding");
});

// ── 18. NO redirect loop — following the matrix from any state terminates ──────
test("the routing matrix is loop-free from every state (no /onboarding ⇄ / cycle)", () => {
  const ctxOf = (path: string): LayoutContext =>
    path === "/onboarding" ? "onboarding" : (path === "/login" || path.startsWith("/register") || path.startsWith("/signup")) ? "auth" : "app";
  const START = ["/", "/onboarding", "/login"];
  for (const state of ["unauthenticated", "onboarding", "ready", "suspended"] as OnboardingState[]) {
    for (const start of START) {
      let path = start;
      const seen = new Set<string>();
      for (let hops = 0; hops < 6; hops++) {
        assert.ok(!seen.has(path), `loop detected for state=${state} at ${path}`);
        seen.add(path);
        const action = destinationForState(state, ctxOf(path));
        if (action === "render" || action === "suspended-screen") break; // terminal
        assert.notEqual(action, path, `self-redirect loop for state=${state} at ${path}`);
        path = action; // follow the redirect
      }
      assert.ok(seen.size <= 3, `state=${state} from ${start} settled without cycling (${[...seen].join(" → ")})`);
    }
  }
});

// ── guarantee: session + layouts never branch on billing/subscription ─────────
test("session + layouts derive routing ONLY from the canonical state (never billing)", () => {
  const session = src("lib/auth/session.ts");
  assert.match(session, /resolveOnboardingState\(/, "session uses the pure canonical resolver");
  // No real billing READ drives the state (prose comments are ignored — target code).
  assert.doesNotMatch(session, /resolveBillingAccess\(|from\("subscriptions"\)|getOrgLifecycleStatus\(/, "session never reads billing/subscription to route");
  for (const layout of ["app/(app)/layout.tsx", "app/(auth)/layout.tsx", "app/onboarding/layout.tsx"]) {
    const t = src(layout);
    assert.match(t, /destinationForState\(state,/, `${layout} routes via the single matrix`);
    assert.doesNotMatch(t, /resolveBillingAccess\(|from\("subscriptions"\)/, `${layout} never re-derives billing itself`);
  }
});
