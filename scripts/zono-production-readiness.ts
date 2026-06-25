/**
 * ZONO — Production Readiness Gate (Phase 20, Enterprise Reliability Platform™).
 *
 * Runs a battery of deterministic checks and prints a PASS / WARNING / FAIL
 * report. Exit code is non-zero only when a hard (FAIL) check trips, so this can
 * gate a deploy. WARNINGs are advisory (e.g. an optional provider key missing →
 * the system degrades to mock, which is fine for staging but flagged for prod).
 *
 * Categories: code gates (tsc/eslint), platform dev-check, migrations present,
 * required + optional environment, and reliability invariants.
 *
 * Run: npx tsx scripts/zono-production-readiness.ts
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";

type Level = "PASS" | "WARNING" | "FAIL";
interface Check { name: string; category: string; run: () => { level: Level; detail: string } }

function sh(cmd: string, args: string[]): { code: number; out: string } {
  const r = spawnSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return { code: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const PROD_RECOMMENDED_ENV = ["CRON_SECRET", "APIFY_TOKEN", "OPENAI_API_KEY"];

const CHECKS: Check[] = [
  {
    name: "TypeScript compiles (tsc --noEmit)", category: "Code gates",
    run: () => {
      const { code } = sh("npx", ["tsc", "--noEmit"]);
      return code === 0 ? { level: "PASS", detail: "no type errors" } : { level: "FAIL", detail: "tsc reported errors" };
    },
  },
  {
    name: "ESLint clean", category: "Code gates",
    run: () => {
      const { code, out } = sh("npx", ["eslint", "src", "--max-warnings", "0"]);
      return code === 0 ? { level: "PASS", detail: "0 problems" } : { level: "FAIL", detail: out.split("\n").slice(-3).join(" ").slice(0, 160) };
    },
  },
  {
    name: "Platform reliability dev-check", category: "Reliability",
    run: () => {
      const { out } = sh("npx", ["tsx", "scripts/platform-dev-check.ts"]);
      return /ALL CHECKS PASSED/.test(out) ? { level: "PASS", detail: "all platform invariants hold" } : { level: "FAIL", detail: "platform dev-check failed" };
    },
  },
  {
    name: "Phase 20 migration present", category: "Database",
    run: () => {
      const f = "supabase/migrations/20260750120000_enterprise_reliability_platform.sql";
      return existsSync(f) ? { level: "PASS", detail: "feature_flags + platform_audit_log migration found" } : { level: "FAIL", detail: "missing reliability migration" };
    },
  },
  {
    name: "Migrations are uniquely timestamped", category: "Database",
    run: () => {
      const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"));
      const prefixes = files.map((f) => f.slice(0, 14));
      const dupes = prefixes.filter((p, i) => prefixes.indexOf(p) !== i);
      return dupes.length === 0 ? { level: "PASS", detail: `${files.length} migrations, no timestamp collisions` } : { level: "FAIL", detail: `duplicate prefixes: ${[...new Set(dupes)].join(", ")}` };
    },
  },
  {
    name: "Required environment present", category: "Environment",
    run: () => {
      const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
      return missing.length === 0
        ? { level: "PASS", detail: "all required vars set" }
        : { level: "WARNING", detail: `not set in this shell: ${missing.join(", ")} (must exist in the deploy env)` };
    },
  },
  {
    name: "Production-recommended environment", category: "Environment",
    run: () => {
      const missing = PROD_RECOMMENDED_ENV.filter((k) => !process.env[k]);
      return missing.length === 0
        ? { level: "PASS", detail: "cron + providers + AI configured" }
        : { level: "WARNING", detail: `optional (degrade gracefully): ${missing.join(", ")}` };
    },
  },
  {
    name: "Production checklist doc present", category: "Operations",
    run: () => (existsSync("docs/PRODUCTION_CHECKLIST.md") ? { level: "PASS", detail: "checklist found" } : { level: "WARNING", detail: "docs/PRODUCTION_CHECKLIST.md missing" }),
  },
  {
    name: "Runbooks present", category: "Operations",
    run: () => (existsSync("docs/RUNBOOKS.md") ? { level: "PASS", detail: "runbooks found" } : { level: "WARNING", detail: "docs/RUNBOOKS.md missing" }),
  },
  {
    name: "Backup & recovery doc present", category: "Operations",
    run: () => (existsSync("docs/BACKUP_RECOVERY.md") ? { level: "PASS", detail: "backup/recovery found" } : { level: "WARNING", detail: "docs/BACKUP_RECOVERY.md missing" }),
  },
  {
    name: "Security audit doc present", category: "Operations",
    run: () => (existsSync("docs/SECURITY_AUDIT.md") ? { level: "PASS", detail: "security audit found" } : { level: "WARNING", detail: "docs/SECURITY_AUDIT.md missing" }),
  },
];

function main(): void {
  console.log("ZONO — Production Readiness Gate\n" + "=".repeat(60) + "\n");
  const results = CHECKS.map((c) => ({ ...c, ...c.run() }));

  let lastCat = "";
  for (const r of results) {
    if (r.category !== lastCat) { console.log(`\n${r.category}`); lastCat = r.category; }
    const icon = r.level === "PASS" ? "✓" : r.level === "WARNING" ? "▲" : "✗";
    console.log(`  ${icon} [${r.level.padEnd(7)}] ${r.name}\n        ${r.detail}`);
  }

  const fails = results.filter((r) => r.level === "FAIL").length;
  const warns = results.filter((r) => r.level === "WARNING").length;
  const pass = results.filter((r) => r.level === "PASS").length;

  console.log("\n" + "=".repeat(60));
  console.log(`Summary: ${pass} PASS · ${warns} WARNING · ${fails} FAIL`);
  console.log(fails === 0
    ? (warns === 0 ? "\nRESULT: ✅ PRODUCTION READY" : "\nRESULT: ✅ READY (with warnings — review before prod)")
    : "\nRESULT: ❌ NOT READY — resolve FAIL checks before deploying");
  process.exit(fails === 0 ? 0 : 1);
}

main();
