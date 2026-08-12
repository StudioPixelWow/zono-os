/*
 * P5.9 — Platform Security QA (LOCAL, no DB, no network).
 * Proves: the capability matrix UI is sourced from the SAME authoritative
 * registry as assertPlatformCapability (no second permission model); sensitive/
 * denied action classification is deterministic; audit diffs strip secrets;
 * platform.admins.manage stays super_admin-only (NOT widened). Last-super-admin
 * protection + operator mutations are DB-level (reviewed) and validated by the
 * static scan + live read-only DB check (real super_admin never mutated).
 * Run: npx tsx scripts/platform-security-qa.ts
 */
import { PLATFORM_ROLES, roleHasCapability } from "../src/lib/platform-admin/capabilities";
import {
  buildCapabilityMatrix, isSensitiveAction, isDeniedAction, stripSecrets, ROLE_LABEL, capabilityLabel,
} from "../src/lib/platform-admin/security/model";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

function main(): void {
  console.log("P5.9 platform-security QA\n");

  // ── 1. Capability matrix is the authoritative registry (no second model). ──
  const m = buildCapabilityMatrix();
  assert(m.roles.length === PLATFORM_ROLES.length, "matrix has every platform role");
  assert(m.rows.every((r) => r.cells.length === PLATFORM_ROLES.length), "matrix cell per role");
  // Every cell EXACTLY mirrors roleHasCapability (the guard's source of truth).
  let mirrored = true;
  for (const row of m.rows) for (const cell of row.cells) if (cell.allowed !== roleHasCapability(cell.role, row.capability)) mirrored = false;
  assert(mirrored, "every matrix cell mirrors roleHasCapability()");

  // ── 2. admins.manage is super_admin-only (NOT widened). ──
  const adminsManage = m.rows.find((r) => r.capability === "platform.admins.manage")!;
  assert(adminsManage.cells.find((c) => c.role === "super_admin")!.allowed, "super_admin has admins.manage");
  assert(adminsManage.cells.filter((c) => c.allowed).length === 1, "ONLY super_admin has admins.manage");
  const adminsRead = m.rows.find((r) => r.capability === "platform.admins.read")!;
  assert(adminsRead.cells.filter((c) => c.allowed).length === 1, "ONLY super_admin has admins.read");
  // support has impersonate but NOT admins.manage; operations/developer/billing have no support/admins mgmt.
  assert(roleHasCapability("support", "platform.support.impersonate") && !roleHasCapability("support", "platform.admins.manage"), "support: impersonate yes, admins.manage no");
  assert(!roleHasCapability("operations", "platform.support.impersonate") && !roleHasCapability("operations", "platform.admins.manage"), "operations: no support/admins mgmt");
  assert(!roleHasCapability("developer", "platform.admins.manage") && !roleHasCapability("billing_admin", "platform.admins.manage"), "developer/billing_admin: no admins.manage");

  // ── 3. Sensitive / denied classification. ──
  assert(isSensitiveAction("platform.operator.role.change"), "operator role change is sensitive");
  assert(isSensitiveAction("platform.operator.suspend"), "operator suspend is sensitive");
  assert(isSensitiveAction("support.impersonation.start"), "impersonation start is sensitive");
  assert(!isSensitiveAction("customers.list"), "customers.list is NOT sensitive");
  assert(!isSensitiveAction("overview.read"), "overview.read is NOT sensitive");
  assert(isDeniedAction("support.impersonation.denied") && !isDeniedAction("support.impersonation.start"), "denied classification");

  // ── 4. Secret stripping in audit diffs. ──
  const stripped = stripSecrets({ role: "support", reason: "test", access_token: "abc", refresh_token: "x", password: "y", nested: { a: 1 } });
  assert(stripped!.role === "support" && stripped!.reason === "test", "safe fields preserved");
  assert(stripped!.access_token === "•••" && stripped!.refresh_token === "•••" && stripped!.password === "•••", "token/password fields masked");
  assert(stripped!.nested === "{…}", "nested objects collapsed (no deep secret leak)");
  assert(stripSecrets(null) === null && stripSecrets("x") === null, "non-object → null");

  // ── 5. Labels present for every role + a sample capability. ──
  assert(PLATFORM_ROLES.every((r) => typeof ROLE_LABEL[r] === "string" && ROLE_LABEL[r].length > 0), "every role has a Hebrew label");
  assert(capabilityLabel("platform.admins.manage").length > 0 && capabilityLabel("unknown.cap") === "unknown.cap", "capability labels + fallback");

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
