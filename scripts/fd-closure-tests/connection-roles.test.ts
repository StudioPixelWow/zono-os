// ============================================================================
// ZONO — Integrations Closure: shared-connection management role gate.
// canManageConnections restricts connect/disconnect of the org's shared Meta/
// WhatsApp integration to owner/manager/admin — an agent must not tear it down.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/connection-roles.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { canManageConnections } from "../../src/lib/auth/connection-roles.ts";

test("owner/manager/admin may manage connections", () => {
  for (const r of ["owner", "manager", "admin", "org_admin", "office_manager"]) {
    assert.equal(canManageConnections(r), true, r);
  }
});

test("agent and other non-privileged roles may NOT", () => {
  for (const r of ["agent", "support", "content_creator", "marketing_manager", "viewer", ""]) {
    assert.equal(canManageConnections(r), false, r);
  }
});

test("case-insensitive + null-safe", () => {
  assert.equal(canManageConnections("OWNER"), true);
  assert.equal(canManageConnections("Manager"), true);
  // @ts-expect-error null tolerance
  assert.equal(canManageConnections(null), false);
});
