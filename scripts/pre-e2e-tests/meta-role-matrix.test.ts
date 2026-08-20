// ============================================================================
// ZONO — Pre-E2E: Meta Workspace authorization matrix (PURE). Proves the role
// ALLOWLISTS still discriminate correctly now that the real roles.key flows in
// (previously every user resolved to "agent" via a non-existent column and every
// gate failed closed). Guards: owner/manager are granted where intended, and an
// AGENT is denied every privileged Meta action (agent is in no Meta allowlist).
// Run: node --experimental-strip-types --test scripts/pre-e2e-tests/meta-role-matrix.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { canViewMessaging, canApproveSendRole, canManageConversation } from "../../src/lib/meta/messaging/roles.ts";
import { canRequestVerification, canResolveDiscrepancy } from "../../src/lib/meta/reconcile/roles.ts";
import { canViewOps } from "../../src/lib/meta/ops/roles.ts";

test("messaging: owner & manager approve/manage; agent denied", () => {
  for (const r of ["owner", "manager"]) {
    assert.equal(canApproveSendRole(r), true, `${r} should approve sends`);
    assert.equal(canManageConversation(r), true, `${r} should manage`);
    assert.equal(canViewMessaging(r), true, `${r} should view`);
  }
  assert.equal(canApproveSendRole("agent"), false, "agent must NOT approve sends");
  assert.equal(canManageConversation("agent"), false, "agent must NOT manage");
  assert.equal(canViewMessaging("agent"), false, "agent must NOT view messaging");
});

test("messaging: content_creator can view but NOT approve (grants preserved, not widened)", () => {
  assert.equal(canViewMessaging("content_creator"), true);
  assert.equal(canApproveSendRole("content_creator"), false);
});

test("reconcile: manager verifies+resolves; agent denied", () => {
  assert.equal(canRequestVerification("manager"), true);
  assert.equal(canResolveDiscrepancy("manager"), true);
  assert.equal(canRequestVerification("owner"), true);
  assert.equal(canRequestVerification("agent"), false);
  assert.equal(canResolveDiscrepancy("agent"), false);
  // marketing_manager may verify but not resolve (exact grant preserved)
  assert.equal(canRequestVerification("marketing_manager"), true);
  assert.equal(canResolveDiscrepancy("marketing_manager"), false);
});

test("ops: owner/admin only; manager and agent denied", () => {
  assert.equal(canViewOps("owner"), true);
  assert.equal(canViewOps("admin"), true);
  assert.equal(canViewOps("org_admin"), true);
  assert.equal(canViewOps("manager"), false);
  assert.equal(canViewOps("agent"), false);
});

test("role matching is case-insensitive and safe on empty/garbage", () => {
  assert.equal(canViewMessaging("OWNER"), true);
  assert.equal(canViewMessaging(""), false);
  assert.equal(canViewOps("nonsense_role"), false);
});
