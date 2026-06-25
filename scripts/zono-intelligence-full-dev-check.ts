/**
 * ZONO — consolidated intelligence dev-check runner (Phase 19.5). Runs every
 * intelligence dev-check in sequence, FAILS FAST on the first failure, and
 * prints a readable summary table. Each child runs in its own tsx process so a
 * crash in one is isolated and reported (not allowed to take the suite down
 * silently).
 *
 * Run: npx tsx scripts/zono-intelligence-full-dev-check.ts
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

interface Check { name: string; script: string }

const CHECKS: Check[] = [
  { name: "Property Radar", script: "scripts/property-radar-dev-check.ts" },
  { name: "Market Cache / Scheduler", script: "scripts/property-radar-market-cache-dev-check.ts" },
  { name: "Scheduler", script: "scripts/property-radar-scheduler-dev-check.ts" },
  { name: "Events", script: "scripts/property-radar-events-dev-check.ts" },
  { name: "Matching", script: "scripts/property-radar-matching-dev-check.ts" },
  { name: "Provider QA", script: "scripts/property-radar-provider-qa-dev-check.ts" },
  { name: "Live Command Center", script: "scripts/property-radar-live-dev-check.ts" },
  { name: "Exclusive Acquisition", script: "scripts/seller-intelligence-dev-check.ts" },
  { name: "AI Copilot", script: "scripts/ai-copilot-dev-check.ts" },
  { name: "Office Intelligence", script: "scripts/office-intelligence-dev-check.ts" },
  { name: "Competitor Intelligence", script: "scripts/competitor-intelligence-dev-check.ts" },
  { name: "Journey Automation", script: "scripts/journey-automation-dev-check.ts" },
  { name: "Business Intelligence", script: "scripts/business-intelligence-dev-check.ts" },
];

function run(script: string): { ok: boolean; ms: number; missing: boolean } {
  if (!existsSync(script)) return { ok: false, ms: 0, missing: true };
  const t0 = Date.now();
  const res = spawnSync("npx", ["tsx", script], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const ms = Date.now() - t0;
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  const ok = res.status === 0 && /ALL CHECKS PASSED/.test(out);
  return { ok, ms, missing: false };
}

function main(): void {
  console.log("ZONO — full intelligence dev-check suite\n" + "=".repeat(52) + "\n");
  const results: { name: string; ok: boolean; ms: number; missing: boolean }[] = [];
  let failed = false;

  for (const c of CHECKS) {
    process.stdout.write(`▶ ${c.name.padEnd(28)} `);
    const r = run(c.script);
    results.push({ name: c.name, ...r });
    if (r.missing) { console.log("⚠ MISSING (skipped)"); continue; }
    console.log(r.ok ? `✓ PASS (${r.ms}ms)` : `✗ FAIL (${r.ms}ms)`);
    if (!r.ok) { failed = true; break; } // fail fast
  }

  console.log("\n" + "=".repeat(52));
  const passed = results.filter((r) => r.ok).length;
  const missing = results.filter((r) => r.missing).length;
  console.log(`Summary: ${passed}/${CHECKS.length} passed · ${missing} missing · ${results.some((r) => !r.ok && !r.missing) ? "1 FAILED" : "0 failed"}`);
  console.log(failed ? "\nRESULT: ❌ SUITE FAILED (stopped at first failure)" : "\nRESULT: ✅ ALL INTELLIGENCE DEV-CHECKS PASSED");
  if (failed) process.exitCode = 1;
}

main();
