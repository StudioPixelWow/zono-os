/*
 * P5.2 — Customer 360 QA (LOCAL, no DB, no network).
 * Proves the Customer 360 structural + authorization + tenancy + data-safety
 * invariants without touching production.
 * Run: npx tsx scripts/platform-customer360-qa.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { operatorCan, type PlatformOperator, type PlatformRole, type PlatformCapability } from "../src/lib/platform-admin";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }
const op = (role: PlatformRole, status: "active" | "suspended" = "active"): PlatformOperator => ({ userId: "u", role, status });
const can = (o: PlatformOperator | null, c: PlatformCapability) => operatorCan(o, c);

const C360_DIR = "src/app/platform/customers/[orgId]";
// tab sub-path → required capability (MUST match Customer360Tabs + each page guard)
const TABS: { sub: string; cap: PlatformCapability }[] = [
  { sub: "", cap: "platform.customers.read" },
  { sub: "users", cap: "platform.users.read" },
  { sub: "usage", cap: "platform.usage.read" },
  { sub: "distribution", cap: "platform.usage.read" },
  { sub: "integrations", cap: "platform.integrations.read" },
  { sub: "activity", cap: "platform.audit.read" },
  { sub: "access", cap: "platform.customers.read" },
  { sub: "operations", cap: "platform.ops.read" },
  { sub: "billing", cap: "platform.billing.read" },
];

function main(): void {
  console.log("P5.2 Customer 360 QA\n");

  // ── 1. Every tab page exists + guards with the matching capability. ──
  for (const t of TABS) {
    const file = join(C360_DIR, t.sub, "page.tsx");
    const exists = existsSync(file);
    assert(exists, `tab "${t.sub || "overview"}" page exists`);
    if (!exists) continue;
    const src = readFileSync(file, "utf8");
    const guardCap = src.match(/authorizePlatform\(\s*["']([^"']+)["']\s*\)/)?.[1];
    assert(guardCap === t.cap, `tab "${t.sub || "overview"}" guards with ${t.cap}`);
  }
  // Layout is base-gated by customers.read.
  const layout = readFileSync(join(C360_DIR, "layout.tsx"), "utf8");
  assert(/authorizePlatform\(\s*["']platform\.customers\.read["']\s*\)/.test(layout), "Customer 360 layout gated by customers.read");

  // ── 2. No direct service-role client in any Customer 360 page/component. ──
  const uiFiles = [
    "src/components/platform-admin/customer360-ui.tsx",
    "src/components/platform-admin/Customer360Header.tsx",
    "src/components/platform-admin/Customer360Tabs.tsx",
    "src/components/platform-admin/CopyIdButton.tsx",
    "src/components/platform-admin/CustomersDirectory.tsx",
    ...TABS.map((t) => join(C360_DIR, t.sub, "page.tsx")),
    join(C360_DIR, "layout.tsx"),
  ];
  for (const f of uiFiles) assert(!/createServiceRoleClient/.test(readFileSync(f, "utf8")), `no service-role client: ${f.replace("src/", "")}`);

  // ── 3. Tenancy: every org-column equality in the Customer 360 DAL binds to the
  //      `orgId` param — never a literal or client-controlled value. ──
  const dal = readFileSync("src/lib/platform-admin/server/dal.ts", "utf8");
  const c360 = dal.slice(dal.indexOf("P5.2 — CUSTOMER 360"));
  assert(c360.length > 0, "Customer 360 DAL block located");
  const eqMatches = [...c360.matchAll(/\beq\(\s*["'](org_id|organization_id|id)["']\s*,\s*([^),]+)\)/g)];
  assert(eqMatches.length > 0, `found ${eqMatches.length} org-scoped equality bindings`);
  for (const m of eqMatches) {
    const val = m[2].trim();
    assert(val === "orgId", `org-column ${m[1]} binds to orgId (got: ${val})`);
  }
  // safeCount/readOne/latestTimestamp calls must all carry orgId.
  for (const fn of ["getOrgHeaderForPlatform", "getOrgOverviewForPlatform", "getOrgUsersForPlatform", "getOrgProductUsageForPlatform", "getOrgDistributionForPlatform", "getOrgIntegrationsForPlatform", "getOrgActivityForPlatform", "getOrgAccessForPlatform", "getOrgBillingForPlatform", "getOrgOperationsForPlatform"]) {
    const idx = c360.indexOf(`export async function ${fn}`);
    assert(idx >= 0, `DAL exports ${fn}`);
    if (idx < 0) continue;
    const next = c360.indexOf("export ", idx + 10);
    const body = c360.slice(idx, next < 0 ? undefined : next);
    assert(body.includes("orgId"), `${fn} scopes to orgId`);
    assert(body.includes("assertPlatformCapability"), `${fn} enforces a platform capability`);
  }

  // ── 4. DTO safety — no secret/PII columns in ANY dal.ts select(). ──
  const selects = [...dal.matchAll(/\.select\(\s*["'`]([^"'`]*)["'`]/g)].map((m) => m[1]);
  const EXACT = new Set(["email", "phone", "ip", "user_agent", "signature", "raw_payload", "provider_txn_id", "token_ref", "access_token_encrypted", "refresh_token_encrypted", "session_ref", "secret_hash", "code_hash", "lease_token", "old_values", "new_values", "sync_token", "google_sub", "password"]);
  const SUBSTR = ["token", "secret", "password", "credential"];
  for (const sel of selects) {
    const cols = sel.split(",").map((c) => c.trim().toLowerCase().replace(/:.*/, "").replace(/\(.*/, ""));
    const bad = cols.filter((c) => EXACT.has(c) || SUBSTR.some((s) => c.includes(s)));
    assert(bad.length === 0, `select is secret/PII-free: "${sel.length > 48 ? sel.slice(0, 48) + "…" : sel}"`);
  }

  // ── 5. Authorization matrix by platform role (section visibility). ──
  assert(!can(null, "platform.customers.read"), "non-operator denied Customer 360");
  assert(!can(op("super_admin", "suspended"), "platform.customers.read"), "suspended operator denied");
  // super_admin sees every tab.
  for (const t of TABS) assert(can(op("super_admin"), t.cap), `super_admin sees ${t.sub || "overview"}`);
  // support: reads customer/usage/integrations/activity — NOT ops, NOT billing.
  assert(can(op("support"), "platform.usage.read") && can(op("support"), "platform.integrations.read"), "support sees usage + integrations");
  assert(!can(op("support"), "platform.ops.read"), "support: operations HIDDEN");
  assert(!can(op("support"), "platform.billing.read"), "support: billing HIDDEN");
  // billing_admin: billing yes; unrelated operational/usage NO.
  assert(can(op("billing_admin"), "platform.billing.read"), "billing_admin sees billing");
  assert(!can(op("billing_admin"), "platform.usage.read"), "billing_admin: usage/distribution HIDDEN");
  assert(!can(op("billing_admin"), "platform.integrations.read"), "billing_admin: integrations HIDDEN");
  assert(!can(op("billing_admin"), "platform.ops.read"), "billing_admin: operations HIDDEN");
  // operations: ops/integrations/usage yes; billing NO.
  assert(can(op("operations"), "platform.ops.read") && can(op("operations"), "platform.integrations.read"), "operations sees ops + integrations");
  assert(!can(op("operations"), "platform.billing.read"), "operations: billing HIDDEN");
  // developer: flags/entitlements yes (access sub-blocks); billing NO.
  assert(can(op("developer"), "platform.flags.read") && can(op("developer"), "platform.entitlements.read"), "developer sees flags + entitlements");
  assert(!can(op("developer"), "platform.billing.read"), "developer: billing HIDDEN");

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
