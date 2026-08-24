// ============================================================================
// ZONO 9.2 — TEAM TRUTH UNIFICATION regression tests.
// Proves the one coherent truth between ACCESS (`users`, the billing seat source)
// and the OFFICE ROSTER (`office_members`, public/board profile):
//   • invite accept / new owner ENSURE a linked active member (idempotent, no dup);
//   • suspend hides the member, reactivate restores it, history is never deleted;
//   • the public roster never shows a suspended-linked or pending member;
//   • billing seat truth stays `users.status='active'` — office_members never counts;
//   • role assignment can never escalate (a caller can't grant above their own rank);
//   • every sync write is strictly org-scoped (no cross-tenant mutation);
//   • reconciliation is non-destructive (reports orphans/dups, never deletes).
// Behavioral for the PURE rules (membership-rules); source-closure for the server
// wiring (server-only + DB, never executed here). No @/ alias (fd runner).
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/team-truth-9-2.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canAssignRole, rosterRole, memberStatusForAccess, isMemberPubliclyEligible, roleRank, planOfficeReconcile,
} from "../../src/lib/office/membership-rules.ts";

const src = (rel: string) => readFileSync(new URL(`../../src/${rel}`, import.meta.url), "utf8");

// ── 1. Invite accepted → office_member ensured/linked ─────────────────────────
test("invite acceptance ensures a linked roster member (not an insert-less UPDATE)", () => {
  const a = src("lib/team-admin/actions.ts");
  assert.match(a, /ensureOfficeMemberForUser\(db, \{[\s\S]*orgId: inv\.org_id, userId: user\.id/, "accept calls ensureOfficeMemberForUser with the invite org + accepted user");
  assert.doesNotMatch(a, /\.update\(\{ user_id: user\.id \} as never\)\s*\n\s*\.eq\("org_id", inv\.org_id\)\.is\("user_id", null\)/, "the old insert-less email UPDATE is gone");
});

// ── 2. Replay acceptance → no duplicate member ────────────────────────────────
test("ensure is idempotent — already-linked returns a no-op and a race is a benign dup", () => {
  const s = src("lib/office/membership-sync.ts");
  assert.match(s, /already linked\?[\s\S]*if \(\(existing as[\s\S]*\)\?\.id\) return "exists"/, "step 1: an existing (org,user) link short-circuits");
  assert.match(s, /if \(error && !isDup\(error\.message\)\) throw/, "a racing insert (unique org_id,user_id) is swallowed, never duplicated");
});

// ── 3 / 14. Public roster eligibility (behavioral matrix) ─────────────────────
test("active linked user + opted-in → publicly visible; orphan active+opted-in → visible", () => {
  assert.equal(isMemberPubliclyEligible({ memberStatus: "active", showOnWebsite: true, linkedUserStatus: "active" }), true);
  assert.equal(isMemberPubliclyEligible({ memberStatus: "active", showOnWebsite: true, linkedUserStatus: null }), true, "orphan roster member is first-class");
});

// ── 4. Pending invite not visible publicly ────────────────────────────────────
test("a pending invite yields no active public member", () => {
  // A pending invite lives only in org_invitations; the roster row is created ONLY on
  // accept (ensure), and even then show_on_website defaults false → not public.
  const s = src("lib/office/membership-sync.ts");
  assert.match(s, /status: "active", show_on_website: false/, "an ensured member is NOT public by default (manager opt-in preserved)");
  // And the pure rule refuses a non-opted-in member.
  assert.equal(isMemberPubliclyEligible({ memberStatus: "active", showOnWebsite: false, linkedUserStatus: "active" }), false);
});

// ── 5. Suspended user hidden publicly ─────────────────────────────────────────
test("suspend → member inactive AND a suspended-linked member is filtered from the public roster", () => {
  assert.equal(memberStatusForAccess(false), "inactive", "suspend maps the roster row to inactive");
  assert.equal(isMemberPubliclyEligible({ memberStatus: "active", showOnWebsite: true, linkedUserStatus: "suspended" }), false, "belt-and-suspenders: linked-suspended is never public even if propagation was missed");
  const site = src("lib/office-website/site-data.ts");
  assert.match(site, /isMemberPubliclyEligible\(\{[\s\S]*linkedUserStatus: m\.user_id \?/, "public site filters the roster through the canonical eligibility rule");
});

// ── 6. Suspended user preserved historically (no deletes / no reassignment) ────
test("suspend never deletes the member or rewrites assignments", () => {
  const s = src("lib/office/membership-sync.ts");
  assert.doesNotMatch(s, /\.delete\(\)/, "membership-sync never deletes a row");
  const svc = src("lib/team-admin/service.ts");
  assert.doesNotMatch(svc, /owner_id|assigned_agent_id|office_member_id/, "suspend does not touch assignment columns (history stays intact)");
});

// ── 7 / 8. Reactivate restores the SAME member (no second profile) ────────────
test("reactivate sets the member active again via an org+user UPDATE (no new row)", () => {
  assert.equal(memberStatusForAccess(true), "active");
  const s = src("lib/office/membership-sync.ts");
  assert.match(s, /propagateAccessStatusToMember[\s\S]*\.update\(\{ status: memberStatusForAccess\(active\) \}[\s\S]*\.eq\("org_id", orgId\)\.eq\("user_id", userId\)/, "propagate UPDATEs the existing row by (org,user) — never inserts a duplicate");
});

// ── 9 / 10. Billing seat truth stays users.status='active' ────────────────────
test("billing counts users.status='active' — office_members never becomes a seat counter", () => {
  const state = src("lib/commercial/state.ts");
  assert.match(state, /from\("users"[\s\S]*?\.eq\("status", "active"\)/, "seat count is the users status='active' COUNT");
  assert.doesNotMatch(state, /office_members/, "billing state never reads office_members");
  const sync = src("lib/office/membership-sync.ts");
  // No billing CALLS (the word "billing" appears in the doc comment explaining the
  // separation — assert on actual invocations/table writes instead).
  assert.doesNotMatch(sync, /stageOrgSeatQuantity|from\(["']subscriptions["']\)|commercial\/|billing-access/, "the membership sync never invokes any billing/seat mutation");
});

// ── 11. Cross-org member link blocked (every write is org-scoped) ─────────────
test("every membership-sync write filters org_id; reconcile action uses the session org", () => {
  const s = src("lib/office/membership-sync.ts");
  // ensure / propagate / reconcile all constrain by org_id.
  assert.ok((s.match(/\.eq\("org_id", (m\.orgId|orgId)\)/g) ?? []).length >= 4, "all sync queries are org-scoped");
  const a = src("lib/team-admin/actions.ts");
  assert.match(a, /reconcileOfficeMembershipForOrg\(profile\.org_id\)/, "reconcile action uses the SESSION org, never a client-supplied org");
  assert.match(a, /has_min_role.*manager|p_min: "manager"/, "reconcile action is manager+ gated");
});

// ── 12. Role integrity — no escalation (behavioral) ───────────────────────────
test("canAssignRole forbids granting a role above the caller's rank", () => {
  assert.equal(canAssignRole("manager", "owner"), false, "manager cannot mint an owner");
  assert.equal(canAssignRole("manager", "admin"), false, "manager cannot mint an admin");
  assert.equal(canAssignRole("admin", "owner"), false, "a non-owner admin cannot mint an owner");
  assert.equal(canAssignRole("owner", "owner"), true, "an owner may grant owner");
  assert.equal(canAssignRole("manager", "agent"), true, "a manager may assign agent");
  assert.equal(canAssignRole("manager", "manager"), true, "a lateral grant is allowed");
  assert.equal(canAssignRole("agent", "manager"), false, "an agent cannot promote");
  assert.equal(canAssignRole("manager", "nonsense"), false, "an unknown role is never assignable");
  assert.ok(roleRank("owner") > roleRank("admin") && roleRank("admin") > roleRank("manager"), "rank ordering owner>admin>manager");
  // The canonical writer enforces it.
  const svc = src("lib/team-admin/service.ts");
  assert.match(svc, /if \(!canAssignRole\(callerRoleKey, roleKey\)\) throw/, "setUserRole enforces the rank cap");
});

// ── 13. Reconciliation is bounded + non-destructive ───────────────────────────
test("reconcile repairs missing/leaking members but never deletes; reports orphans + dups", () => {
  const s = src("lib/office/membership-sync.ts");
  assert.match(s, /\.limit\(5000\)/, "reconcile is bounded (no unbounded scan)");
  assert.match(s, /orphanMembers: plan\.orphanMembers, duplicateLinks: plan\.duplicateLinks/, "orphans + duplicate links are reported (from the pure planner)");
  const rules = src("lib/office/membership-rules.ts");
  assert.match(rules, /orphanMembers = members\.filter[\s\S]*duplicateLinks =/, "orphans + duplicate links are COUNTED (never deleted)");
  assert.doesNotMatch(s, /\.delete\(\)/, "reconcile never deletes (orphans/dups are reported, not purged)");
  assert.match(s, /crossOrgMismatch: 0/, "cross-org mismatch is 0 by construction (per-org queries)");
});

// ── rosterRole mapping (supporting) ───────────────────────────────────────────
test("rosterRole maps access roles to roster role text (owner/manager/agent)", () => {
  assert.equal(rosterRole("owner"), "owner");
  assert.equal(rosterRole("manager"), "manager");
  assert.equal(rosterRole("agent"), "agent");
  assert.equal(rosterRole("viewer"), "agent");
  assert.equal(rosterRole(null), "agent");
});

// ════════════════════════════════════════════════════════════════════════════
// 9.2B — FINAL ACCEPTANCE (production reconcile convergence + suspended agent site)
// ════════════════════════════════════════════════════════════════════════════

// ── 9.2B-1. Production-style reconcile 2→0 convergence (behavioral) ────────────
test("reconcile plans exactly the drifted active users, then converges to zero", () => {
  // Two active users with NO member (the real prod drift), plus one already-linked
  // active user and nine login-less roster members (first-class, ignored).
  const users = [
    { id: "u-owner-A", status: "active" }, { id: "u-owner-B", status: "active" },
    { id: "u-linked", status: "active" },
  ];
  const members = [
    { user_id: "u-linked", status: "active" },
    ...Array.from({ length: 9 }, () => ({ user_id: null, status: "active" })),
  ];
  const p1 = planOfficeReconcile(users, members);
  assert.deepEqual(p1.toEnsure.sort(), ["u-owner-A", "u-owner-B"], "plans exactly the 2 drifted users");
  assert.equal(p1.toHide.length, 0);
  assert.equal(p1.activeWithMember, 1, "the already-linked active user is not re-ensured");
  // Simulate the reconcile creating those two members, then re-plan.
  const after = [...members, { user_id: "u-owner-A", status: "active" }, { user_id: "u-owner-B", status: "active" }];
  const p2 = planOfficeReconcile(users, after);
  assert.equal(p2.toEnsure.length, 0, "after creation the plan is empty — converged to zero");
});

// ── 9.2B-2. Second reconcile is idempotent (behavioral) ───────────────────────
test("re-running reconcile on a healed org plans nothing (no create/link/hide)", () => {
  const users = [{ id: "a", status: "active" }, { id: "b", status: "suspended" }];
  const members = [{ user_id: "a", status: "active" }, { user_id: "b", status: "inactive" }];
  const p = planOfficeReconcile(users, members);
  assert.equal(p.toEnsure.length, 0, "no missing members");
  assert.equal(p.toHide.length, 0, "the suspended user's member is already inactive → nothing to hide");
});

// ── 9.2B-3/4. Suspended standalone agent page = unavailable + noindex ──────────
test("getAgentSite returns an unavailable state for a suspended-linked agent; page noindexes it", () => {
  const sd = src("lib/agent-website/site-data.ts");
  assert.match(sd, /if \(userStatus && userStatus !== "active"\)[\s\S]*return \{ unavailable: true/, "a non-active linked user → unavailable state (URL preserved, not deleted/redirected)");
  const page = src("app/agent/[slug]/page.tsx");
  assert.match(page, /if \("unavailable" in site\) return \{ title: "הפרופיל אינו פעיל כרגע · ZONO", robots: \{ index: false \} \}/, "metadata noindexes the unavailable state");
  assert.match(page, /if \("unavailable" in site\) return <Unavailable/, "the page renders the Hebrew unavailable state");
  assert.match(page, /הפרופיל אינו פעיל כרגע/, "canonical suspended copy");
  assert.doesNotMatch(page, /redirect\(/, "no redirect to another agent");
});

// ── 9.2B-5. Suspended agent cannot receive a public lead (server fail-closed) ──
test("submitAgentLead fails CLOSED when the linked agent is not active", () => {
  const svc = src("lib/agent-website/service.ts");
  assert.match(svc, /select\("status"\)\.eq\("id", s\.user_id\)\.eq\("org_id", s\.organization_id\)[\s\S]*if \(\(agentUser[\s\S]*\)\?\.status !== "active"\) return \{ ok: false/, "the lead endpoint re-checks the agent's access status before inserting a lead");
});

// ── 9.2B-6. Reactivation restores the SAME canonical URL (no second identity) ──
test("the suspended state is derived, not destructive — reactivation restores the same site/URL", () => {
  const sd = src("lib/agent-website/site-data.ts");
  // The unavailable branch never deletes the agent_websites row and never mints a new
  // slug — it is a per-request read of users.status, so flipping the user back to
  // active restores the original published site at the same /agent/[slug].
  assert.doesNotMatch(sd, /\.delete\(\)/, "getAgentSite never deletes the site");
  assert.doesNotMatch(sd, /\.update\(\{ slug/, "getAgentSite never rewrites the slug");
  assert.equal(memberStatusForAccess(true), "active", "reactivate flips roster + access back to active (same identity)");
});

// ── 9.2B-7. Cross-org / cross-agent safety ────────────────────────────────────
test("suspending agent A cannot affect agent B or another org", () => {
  // The reconcile planner only ever considers the users+members it is handed (one org's
  // rows), and the agent-site guards key strictly on THIS slug's org + user.
  const p = planOfficeReconcile([{ id: "A", status: "suspended" }], [{ user_id: "A", status: "active" }, { user_id: "B", status: "active" }]);
  assert.deepEqual(p.toHide, ["A"], "only the suspended user's member is hidden — B untouched");
  const svc = src("lib/agent-website/service.ts");
  assert.match(svc, /\.eq\("id", s\.user_id\)\.eq\("org_id", s\.organization_id\)/, "lead guard is scoped to this site's own agent + org");
});

// ── 9.2B-8. Billing seat count is untouched by the roster reconcile ───────────
test("the reconcile planner + sync never compute or mutate a billing seat", () => {
  const rules = src("lib/office/membership-rules.ts");
  assert.doesNotMatch(rules, /seat|billing|subscription|quantity/i, "the pure rules never mention seats/billing");
  const sync = src("lib/office/membership-sync.ts");
  assert.doesNotMatch(sync, /stageOrgSeatQuantity|from\(["']subscriptions["']\)/, "reconcile issues no billing write");
});
