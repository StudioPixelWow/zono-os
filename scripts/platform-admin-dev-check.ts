/*
 * P5.0 — Platform Admin authorization matrix dev-check (LOCAL-DEV-ONLY).
 * Pure layer only (no DB, no network, no server-only imports). Proves the
 * authorization DECISION (operatorCan) across the full role × capability matrix
 * and the fail-closed cases. Run: npx tsx scripts/platform-admin-dev-check.ts
 *
 * NOTE: DB/RLS behavior (live cross-org denial) is NOT exercised here — it
 * requires the additive migration to be applied (operator-gated). This proves
 * the code-level matrix A–K from the P5.0 spec.
 */
import {
  PLATFORM_ROLES, PLATFORM_CAPABILITIES, operatorCan, roleHasCapability,
  capabilitiesForRole, type PlatformOperator, type PlatformRole, type PlatformCapability,
} from "../src/lib/platform-admin";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }
const op = (role: PlatformRole, status: "active" | "suspended" = "active"): PlatformOperator => ({ userId: "u", role, status });
const can = (o: PlatformOperator | null, c: PlatformCapability) => operatorCan(o, c);

function main(): void {
  console.log("P5.0 platform-admin authorization matrix\n");

  // A/B/C — non-operators (ordinary agent, org admin, org owner) resolve to a
  // null platform operator → denied for EVERY capability.
  for (const c of PLATFORM_CAPABILITIES) assert(!can(null, c), `non-operator denied: ${c}`);

  // D — inactive (suspended) operator denied even with a privileged role.
  assert(!can(op("super_admin", "suspended"), "platform.customers.read"), "suspended super_admin denied");
  assert(!can(op("operations", "suspended"), "platform.ops.read"), "suspended operations denied");

  // E — support: customer/support reads + impersonate; NOT billing/admin-mgmt.
  assert(can(op("support"), "platform.customers.read"), "support: customers.read");
  assert(can(op("support"), "platform.users.read"), "support: users.read");
  assert(can(op("support"), "platform.support.impersonate"), "support: support.impersonate");
  assert(!can(op("support"), "platform.billing.manage"), "support: NOT billing.manage");
  assert(!can(op("support"), "platform.admins.manage"), "support: NOT admins.manage");
  assert(!can(op("support"), "platform.flags.manage"), "support: NOT flags.manage");

  // F — billing_admin: billing works; unrelated privileged denied.
  assert(can(op("billing_admin"), "platform.billing.read"), "billing_admin: billing.read");
  assert(can(op("billing_admin"), "platform.billing.manage"), "billing_admin: billing.manage");
  assert(!can(op("billing_admin"), "platform.ops.replay"), "billing_admin: NOT ops.replay");
  assert(!can(op("billing_admin"), "platform.support.impersonate"), "billing_admin: NOT impersonate");
  assert(!can(op("billing_admin"), "platform.admins.manage"), "billing_admin: NOT admins.manage");

  // G — operations: ops + integrations; NOT admin-management/billing.
  assert(can(op("operations"), "platform.ops.read"), "operations: ops.read");
  assert(can(op("operations"), "platform.ops.replay"), "operations: ops.replay");
  assert(can(op("operations"), "platform.integrations.manage"), "operations: integrations.manage");
  assert(!can(op("operations"), "platform.admins.manage"), "operations: NOT admins.manage");
  assert(!can(op("operations"), "platform.billing.manage"), "operations: NOT billing.manage");

  // developer: flags/entitlements; NOT billing/impersonate/admins.
  assert(can(op("developer"), "platform.flags.manage"), "developer: flags.manage");
  assert(can(op("developer"), "platform.entitlements.manage"), "developer: entitlements.manage");
  assert(!can(op("developer"), "platform.billing.read"), "developer: NOT billing.read");
  assert(!can(op("developer"), "platform.support.impersonate"), "developer: NOT impersonate");
  assert(!can(op("developer"), "platform.admins.manage"), "developer: NOT admins.manage");

  // H — super_admin holds EVERY capability.
  for (const c of PLATFORM_CAPABILITIES) assert(can(op("super_admin"), c), `super_admin: ${c}`);

  // I — the decision function takes NO orgId: authorization cannot be derived
  // from a (client-supplied) organizationId. A non-operator stays denied no
  // matter what; capability is a function of (role,status) only.
  assert(operatorCan.length === 2, "operatorCan(operator, capability) — no orgId param");

  // Structural invariants.
  assert(capabilitiesForRole("super_admin").length === PLATFORM_CAPABILITIES.length, "super_admin == all capabilities");
  for (const r of PLATFORM_ROLES) {
    const caps = capabilitiesForRole(r);
    assert(caps.every((c) => (PLATFORM_CAPABILITIES as readonly string[]).includes(c)), `${r}: caps ⊆ registry`);
    assert(caps.every((c) => roleHasCapability(r, c)), `${r}: roleHasCapability consistent`);
  }
  // Least-privilege: only super_admin may manage other admins.
  for (const r of PLATFORM_ROLES) assert((r === "super_admin") === roleHasCapability(r, "platform.admins.manage"), `${r}: admins.manage only super_admin`);

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
