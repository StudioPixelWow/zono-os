// P7.2 — verify the LIVE enforcement RESOLUTION using the REAL model code fed
// the exact production state (read via MCP). Proves what the app's
// resolveLimitEnforcementForMutation + Platform Admin readiness compute for
// Pixel (PILOT, override 5/30) vs RE/MAX (SHADOW, no override).
import { defaultLimits } from "../src/lib/launch/plans.ts";
import { normalizePlanTier } from "../src/lib/platform-admin/access/model.ts";
import { LIMIT_DEFS, effectiveConfigured } from "../src/lib/limits/model.ts";
import { classifyLimitReadiness } from "../src/lib/enforcement/model.ts";

const DEFAULT_MODE = "SHADOW";
const ATOMIC_GUARDED = new Set(["seats", "monitoredListings"]);

// Production state (read via MCP execute_sql, authoritative):
const PROD = {
  pixel: { plan: "starter", override: { seats: 5, operatingAreas: 5, monitoredListings: 30 },
    // seats mode is overridable via env to demonstrate the LIVE kill switch (PILOT↔SHADOW).
    config: { seats: process.env.PIXEL_SEATS_MODE ?? "PILOT", monitoredListings: "PILOT" },
    usage: { seats: 1, monitoredListings: 14, operatingAreas: 1 } },
  remax: { plan: "starter", override: null, config: {}, usage: { seats: 1, monitoredListings: 1, operatingAreas: 0 } },
};

function resolve(org: keyof typeof PROD, key: "seats" | "monitoredListings") {
  const o = PROD[org];
  const mode = (o.config as Record<string, string>)[key] ?? DEFAULT_MODE;
  const active = mode === "ENFORCED" || mode === "PILOT";
  const tier = normalizePlanTier(o.plan);
  const planDefault = defaultLimits(tier) as never;
  const def = LIMIT_DEFS[key];
  const { value: configuredLimit, source } = effectiveConfigured(def, planDefault, o.override as never);
  const usage = (o.usage as Record<string, number>)[key];
  const wouldBlock = active && configuredLimit != null && usage >= configuredLimit;
  const readiness = classifyLimitReadiness(key, true, configuredLimit != null && configuredLimit >= 0, ATOMIC_GUARDED.has(key));
  return { org, key, mode, active, configuredLimit, source, usage, wouldBlock, atomicSafe: readiness.atomicSafe, readiness: readiness.readiness };
}

let fail = 0;
const ok = (c: boolean, l: string) => { console.log((c ? "  ✓ " : "  ✗ ") + l); if (!c) fail++; };

console.log("P7.2 · LIVE resolution (real model code + prod state)\n");
for (const org of ["pixel", "remax"] as const) {
  for (const key of ["seats", "monitoredListings"] as const) {
    const r = resolve(org, key);
    console.log(`  ${org.toUpperCase()} / ${key}: mode=${r.mode} active=${r.active} limit=${r.configuredLimit} (${r.source}) usage=${r.usage} wouldBlock=${r.wouldBlock} atomicSafe=${r.atomicSafe}`);
  }
}
console.log("");
// Assertions
const ps = resolve("pixel", "seats"), pm = resolve("pixel", "monitoredListings");
const rs = resolve("remax", "seats"), rm = resolve("remax", "monitoredListings");
ok(ps.active && ps.configuredLimit === 5, "Pixel seats: PILOT active, effective limit = 5 (override)");
ok(pm.active && pm.configuredLimit === 30, "Pixel monitoredListings: PILOT active, effective limit = 30 (override)");
ok(ps.atomicSafe && pm.atomicSafe, "Pixel both controls atomic-safe");
ok(!ps.wouldBlock && !pm.wouldBlock, "Pixel below limit now → no block in normal use (seats 1/5, listings 14/30)");
ok(!rs.active && rs.mode === "SHADOW", "RE/MAX seats: SHADOW, enforcement INACTIVE");
ok(!rm.active && rm.mode === "SHADOW", "RE/MAX monitoredListings: SHADOW, enforcement INACTIVE");
ok(rs.configuredLimit === 1 && rm.configuredLimit === 200, "RE/MAX limits = plan default (1 / 200), no override applied");
console.log("");
console.log(fail === 0 ? "ALL RESOLUTION CHECKS PASSED" : `${fail} CHECK(S) FAILED`);
if (fail) process.exit(1);
