/*
 * P5.3 — Platform Users / Seats / Permissions QA (LOCAL, no DB, no network).
 * Proves the authorization, tenancy, owner-protection, data-safety and
 * suspension-enforcement invariants of the platform user-admin layer.
 * Run: npx tsx scripts/platform-user-admin-qa.ts
 */
import { readFileSync } from "node:fs";
import { operatorCan, PLATFORM_ROLES, type PlatformOperator, type PlatformRole, type PlatformCapability } from "../src/lib/platform-admin";
import { isBlockedAccountStatus } from "../src/lib/auth/account-status";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }
const op = (role: PlatformRole, status: "active" | "suspended" = "active"): PlatformOperator => ({ userId: "u", role, status });
const can = (o: PlatformOperator | null, c: PlatformCapability) => operatorCan(o, c);

const DAL = readFileSync("src/lib/platform-admin/server/user-admin.ts", "utf8");
const ACTIONS = readFileSync("src/lib/platform-admin/server/user-admin-actions.ts", "utf8");
const SESSION = readFileSync("src/lib/auth/session.ts", "utf8");

const MUTATIONS = ["invitePlatformUser", "resendPlatformInvite", "setPlatformUserStatus", "setPlatformUserRole"];

function fnBody(src: string, name: string): string {
  const i = src.indexOf(`export async function ${name}`);
  if (i < 0) return "";
  const next = src.indexOf("\nexport ", i + 10);
  return src.slice(i, next < 0 ? undefined : next);
}

function main(): void {
  console.log("P5.3 platform user-admin QA\n");

  // ── 1. Authorization matrix. Reads = users.read (all); mutations = users.manage
  //      (super_admin ONLY — no widening). ──
  const READ = "platform.users.read", MANAGE = "platform.users.manage";
  assert(!can(null, READ), "non-operator denied users.read");
  assert(!can(op("super_admin", "suspended"), READ), "suspended operator denied users.read");
  for (const r of PLATFORM_ROLES) assert(can(op(r), READ), `${r} may read users`);
  assert(can(op("super_admin"), MANAGE), "super_admin may manage users");
  for (const r of ["support", "operations", "billing_admin", "developer"] as PlatformRole[]) {
    assert(!can(op(r), MANAGE), `${r} CANNOT manage users (no widening)`);
  }
  assert(!can(null, MANAGE) && !can(op("super_admin", "suspended"), MANAGE), "non/suspended operator cannot manage");

  // ── 2. Every mutation enforces platform.users.manage first. ──
  for (const m of MUTATIONS) {
    const body = fnBody(DAL, m);
    assert(body.length > 0, `DAL exports ${m}`);
    assert(/assertPlatformCapability\(MANAGE\)/.test(body), `${m} requires platform.users.manage`);
  }

  // ── 3. Tenancy: every org-column equality binds to orgId (never a literal). ──
  const eqMatches = [...DAL.matchAll(/\beq\(\s*["'](org_id|organization_id)["'](?:\s+as\s+never)?\s*,\s*([^,)]+)\)/g)];
  assert(eqMatches.length > 0, `found ${eqMatches.length} org-scoped equality bindings`);
  for (const m of eqMatches) {
    const val = m[2].replace(/\s+as\s+never/, "").trim();
    assert(val === "orgId", `org-column ${m[1]} binds to orgId (got: ${val})`);
  }
  // Status/role writes must scope BOTH id (target user) and org_id (tenant).
  for (const m of ["setPlatformUserStatus", "setPlatformUserRole"]) {
    const body = fnBody(DAL, m);
    assert(/\.update\(/.test(body), `${m} performs an update`);
    assert(/\.eq\("id" as never, userId as never\)/.test(body) && /\.eq\("org_id" as never, orgId as never\)/.test(body), `${m} update scopes id+org_id`);
    assert(/resolveOrgUser\(/.test(body), `${m} resolves target strictly within org (tenancy)`);
  }

  // ── 4. Owner protection + role validation. ──
  assert(/countActiveOwners/.test(fnBody(DAL, "setPlatformUserStatus")), "suspend guards last active owner");
  assert(/countActiveOwners/.test(fnBody(DAL, "setPlatformUserRole")), "role change guards last owner (no demote)");
  assert(/assertRoleInOrg/.test(fnBody(DAL, "setPlatformUserRole")), "role change validates role belongs to org (no platform role)");
  assert(/assertRoleInOrg/.test(fnBody(DAL, "invitePlatformUser")), "invite validates role belongs to org");

  // ── 5. DTO / secret safety in user-admin selects. ──
  const selects = [...DAL.matchAll(/\.select\(\s*["'`]([^"'`]*)["'`]/g)].map((m) => m[1]);
  for (const sel of selects) {
    assert(!/\btoken\b/.test(sel), `select never exposes token: "${sel.slice(0, 40)}"`);
    const cols = sel.split(",").map((c) => c.trim().toLowerCase().replace(/:.*/, "").replace(/\(.*/, ""));
    // email permitted ONLY in the invitation select (contains role_key) — gated by users.manage.
    const emailAllowed = sel.includes("role_key");
    for (const c of cols) {
      if (c === "email") { assert(emailAllowed, `email only in invitation select: "${sel.slice(0, 40)}"`); continue; }
      assert(!["phone", "password", "ip", "user_agent"].includes(c) && !c.includes("token") && !c.includes("secret"), `no PII/secret column "${c}"`);
    }
  }
  // Audit calls never carry a token.
  for (const line of DAL.split("\n")) {
    if (line.includes("writePlatformAudit(")) assert(!/\btoken\b/.test(line), "audit call carries no token");
  }

  // ── 6. Actions never touch a service-role client directly. ──
  assert(!/createServiceRoleClient/.test(ACTIONS), "use-server actions do not create a service-role client");

  // ── 7. Suspension enforcement (real, not cosmetic). ──
  assert(isBlockedAccountStatus("suspended") && isBlockedAccountStatus("disabled"), "suspended/disabled are blocked");
  assert(!isBlockedAccountStatus("active") && !isBlockedAccountStatus("invited") && !isBlockedAccountStatus(null), "active/invited/null NOT blocked");
  assert(/isBlockedAccountStatus/.test(SESSION) && /state:\s*"suspended"/.test(SESSION), "session guard enforces suspended state");

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
