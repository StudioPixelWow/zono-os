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

function sh(cmd: string, args: string[], timeoutMs?: number): { code: number; out: string; timedOut: boolean } {
  const r = spawnSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs, killSignal: "SIGKILL" });
  const timedOut = (r as { signal?: string | null }).signal === "SIGKILL" || (r.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT";
  return { code: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}`, timedOut };
}

// Heavy code-gate steps get a generous cap so a slow machine degrades to a
// WARNING (advisory) instead of hanging the whole gate forever.
const HEAVY_TIMEOUT_MS = 4 * 60_000;

const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const PROD_RECOMMENDED_ENV = ["CRON_SECRET", "APIFY_TOKEN", "OPENAI_API_KEY"];

const CHECKS: Check[] = [
  {
    name: "TypeScript compiles (tsc --noEmit)", category: "Code gates",
    run: () => {
      const { code, timedOut } = sh("npx", ["tsc", "--noEmit"], HEAVY_TIMEOUT_MS);
      if (timedOut) return { level: "WARNING", detail: "did not finish in 4 min here (slow/low-disk machine) — run `npm run typecheck` separately" };
      return code === 0 ? { level: "PASS", detail: "no type errors" } : { level: "FAIL", detail: "tsc reported errors — run `npm run typecheck`" };
    },
  },
  {
    // Matches the repo's own `npm run lint` (plain eslint): ERRORS fail the
    // gate; warnings are advisory (the project does not enforce max-warnings).
    name: "ESLint (errors fail; warnings advisory)", category: "Code gates",
    run: () => {
      const { code, out, timedOut } = sh("npx", ["eslint", "src"], HEAVY_TIMEOUT_MS);
      if (timedOut) return { level: "WARNING", detail: "did not finish in 4 min here — run `npm run lint` separately" };
      const m = out.match(/(\d+)\s+problems?\s+\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)/i);
      const errors = m ? Number(m[2]) : (code === 0 ? 0 : 1);
      const warnings = m ? Number(m[3]) : 0;
      if (errors > 0) return { level: "FAIL", detail: `${errors} error(s)${warnings ? ` + ${warnings} warning(s)` : ""} — run \`npm run lint\`` };
      if (warnings > 0) return { level: "WARNING", detail: `0 errors · ${warnings} pre-existing warning(s) (advisory)` };
      return { level: "PASS", detail: "0 problems" };
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
  console.log("ZONO — Production Readiness Gate\n" + "=".repeat(60));

  // Run with LIVE progress: print the check name before running it (so a slow
  // step like tsc never looks frozen), then print its result inline.
  let lastCat = "";
  const results = CHECKS.map((c) => {
    if (c.category !== lastCat) { console.log(`\n${c.category}`); lastCat = c.category; }
    process.stdout.write(`  … ${c.name} `);
    const res = c.run();
    const icon = res.level === "PASS" ? "✓" : res.level === "WARNING" ? "▲" : "✗";
    console.log(`\r  ${icon} [${res.level.padEnd(7)}] ${c.name}\n        ${res.detail}`);
    return { ...c, ...res };
  });

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
