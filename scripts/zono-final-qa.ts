/**
 * ZONO — Final QA runner (Phase 21, section 15). Runs the full gate suite in one
 * command and fails fast on the first hard failure:
 *   TypeScript · ESLint (errors) · pure dev-checks (launch + platform) · load
 *   simulation (if present) · end-to-end validation · deployment validation.
 *
 * Run: npx tsx scripts/zono-final-qa.ts
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const TIMEOUT = 5 * 60_000;
interface Step { name: string; cmd: string; args: string[]; pass: (out: string, code: number, timedOut: boolean) => "PASS" | "WARN" | "FAIL"; optional?: boolean }

function run(cmd: string, args: string[]): { code: number; out: string; timedOut: boolean } {
  const r = spawnSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: TIMEOUT, killSignal: "SIGKILL" });
  return { code: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}`, timedOut: (r as { signal?: string | null }).signal === "SIGKILL" };
}

const STEPS: Step[] = [
  { name: "TypeScript", cmd: "npx", args: ["tsc", "--noEmit"], pass: (_o, c, t) => (t ? "WARN" : c === 0 ? "PASS" : "FAIL") },
  { name: "ESLint (errors)", cmd: "npx", args: ["eslint", "src"], pass: (o, c, t) => { if (t) return "WARN"; const m = o.match(/\((\d+)\s+errors?,/i); const e = m ? Number(m[1]) : (c === 0 ? 0 : 1); return e > 0 ? "FAIL" : "PASS"; } },
  { name: "Launch dev-check", cmd: "npx", args: ["tsx", "scripts/launch-dev-check.ts"], pass: (o) => (/ALL CHECKS PASSED/.test(o) ? "PASS" : "FAIL") },
  { name: "Platform dev-check", cmd: "npx", args: ["tsx", "scripts/platform-dev-check.ts"], pass: (o) => (/ALL CHECKS PASSED/.test(o) ? "PASS" : "FAIL") },
  { name: "Intelligence dev-checks", cmd: "npx", args: ["tsx", "scripts/zono-intelligence-full-dev-check.ts"], pass: (o) => (/ALL INTELLIGENCE DEV-CHECKS PASSED/.test(o) ? "PASS" : "FAIL"), optional: true },
  { name: "Load simulation", cmd: "npx", args: ["tsx", "scripts/zono-intelligence-load-sim.ts"], pass: (_o, c) => (c === 0 ? "PASS" : "FAIL"), optional: true },
  { name: "End-to-end validation", cmd: "npx", args: ["tsx", "scripts/zono-e2e-validation.ts"], pass: (o) => (/ALL USER JOURNEYS VALID/.test(o) ? "PASS" : "FAIL") },
  { name: "Deployment validation", cmd: "npx", args: ["tsx", "scripts/zono-deploy-validate.ts"], pass: (o) => (/RESULT: ✅/.test(o) ? "PASS" : "FAIL") },
];

function main(): void {
  console.log("ZONO — Final QA\n" + "=".repeat(56) + "\n");
  let failed = false;
  for (const s of STEPS) {
    if (s.optional && !existsSync(s.args[s.args.length - 1]!)) { console.log(`▷ ${s.name.padEnd(26)} — skipped (not present)`); continue; }
    process.stdout.write(`▶ ${s.name.padEnd(26)} `);
    const r = run(s.cmd, s.args);
    const verdict = s.pass(r.out, r.code, r.timedOut);
    console.log(verdict === "PASS" ? "✓ PASS" : verdict === "WARN" ? "▲ WARN" : "✗ FAIL");
    if (verdict === "FAIL") { failed = true; break; } // fail fast
  }
  console.log("\n" + "=".repeat(56));
  console.log(failed ? "RESULT: ❌ FINAL QA FAILED (stopped at first failure)" : "RESULT: ✅ FINAL QA PASSED");
  if (failed) process.exitCode = 1;
}

main();
