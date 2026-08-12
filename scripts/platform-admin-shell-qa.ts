/*
 * P5.1 — Platform Admin Shell QA (LOCAL, no DB, no network).
 * Proves the shell's structural + authorization invariants:
 *   1. Every nav leaf routes to a real page file (no broken routes).
 *   2. Every /platform page is server-guarded by authorizePlatform(cap), and the
 *      asserted capability MATCHES the nav model's declared capability.
 *   3. No /platform page or platform-admin component uses a service-role client
 *      directly (all cross-org reads must go through the audited DAL).
 *   4. DTO safety: the platform DAL never selects email/phone/secret columns.
 *   5. Authorization matrix for the shell + overview gating (via pure operatorCan).
 * Run: npx tsx scripts/platform-admin-shell-qa.ts
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PLATFORM_NAV_LEAVES } from "../src/components/platform-admin/nav-model";
import { operatorCan, PLATFORM_ROLES, type PlatformOperator, type PlatformRole } from "../src/lib/platform-admin";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }
const op = (role: PlatformRole, status: "active" | "suspended" = "active"): PlatformOperator => ({ userId: "u", role, status });

const APP = "src/app";
const PLATFORM_DIR = join(APP, "platform");

function hrefToPageFile(href: string): string {
  return join(APP, href.replace(/^\//, ""), "page.tsx");
}

function walkPages(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkPages(p));
    else if (name === "page.tsx") out.push(p);
  }
  return out;
}

function main(): void {
  console.log("P5.1 platform-admin shell QA\n");

  // ── 1 + 2. Nav leaves → real, capability-guarded pages (cap matches nav). ──
  const capOf = (src: string): string | null => src.match(/authorizePlatform\(\s*["']([^"']+)["']\s*\)/)?.[1] ?? null;
  for (const leaf of PLATFORM_NAV_LEAVES) {
    const file = hrefToPageFile(leaf.href);
    const exists = existsSync(file);
    assert(exists, `nav "${leaf.label}" → page exists (${leaf.href})`);
    if (!exists) continue;
    const src = readFileSync(file, "utf8");
    assert(capOf(src) === leaf.cap, `nav "${leaf.label}" page guards with ${leaf.cap}`);
  }

  // ── 2b. EVERY page under /platform is server-guarded (incl. drill-downs). ──
  const pages = walkPages(PLATFORM_DIR);
  assert(pages.length >= PLATFORM_NAV_LEAVES.length, `found ${pages.length} platform page files`);
  for (const file of pages) {
    const src = readFileSync(file, "utf8");
    const guarded = /authorizePlatform\(/.test(src);
    assert(guarded, `guarded: ${file.replace(APP + "/", "")}`);
  }

  // ── 3. No direct service-role client in pages or components. ──
  const scanDirs = [PLATFORM_DIR, "src/components/platform-admin"];
  for (const dir of scanDirs) {
    const files: string[] = [];
    const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(n)) files.push(p); } };
    walk(dir);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      assert(!/createServiceRoleClient/.test(src), `no service-role client: ${f.replace("src/", "")}`);
    }
  }

  // ── 4. DTO safety — the DAL never selects sensitive columns. ──
  const dal = readFileSync("src/lib/platform-admin/server/dal.ts", "utf8");
  const selects = [...dal.matchAll(/\.select\(\s*["'`]([^"'`]*)["'`]/g)].map((m) => m[1]);
  assert(selects.length > 0, `DAL has ${selects.length} select() column lists to audit`);
  const FORBIDDEN = ["email", "phone", "password", "token", "secret", "ip", "user_agent"];
  for (const sel of selects) {
    const cols = sel.split(",").map((c) => c.trim().toLowerCase());
    const bad = cols.filter((c) => FORBIDDEN.some((f) => c === f || c.includes(f)));
    assert(bad.length === 0, `select is PII/secret-free: "${sel}"`);
  }

  // ── 5. Authorization matrix — shell base gate + overview usage/ops gating. ──
  const SHELL = "platform.customers.read" as const;
  // Non-operators (org owner/admin/agent → resolve to null) never reach the shell.
  assert(!operatorCan(null, SHELL), "non-operator (org owner/admin/agent) denied shell");
  // Suspended operator denied even with a privileged role.
  assert(!operatorCan(op("super_admin", "suspended"), SHELL), "suspended operator denied shell");
  // Every ACTIVE platform role can enter the shell (holds base read).
  for (const r of PLATFORM_ROLES) assert(operatorCan(op(r), SHELL), `active ${r} may enter shell`);
  // Overview usage metrics require usage.read; ops health requires ops.read.
  assert(operatorCan(op("operations"), "platform.usage.read"), "operations sees usage metrics");
  assert(operatorCan(op("operations"), "platform.ops.read"), "operations sees ops health");
  assert(!operatorCan(op("billing_admin"), "platform.usage.read"), "billing_admin: usage RESTRICTED");
  assert(!operatorCan(op("billing_admin"), "platform.ops.read"), "billing_admin: ops RESTRICTED");
  assert(operatorCan(op("support"), "platform.usage.read"), "support sees usage metrics");
  assert(!operatorCan(op("support"), "platform.ops.read"), "support: ops RESTRICTED");
  assert(operatorCan(op("developer"), "platform.usage.read"), "developer sees usage metrics");

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
