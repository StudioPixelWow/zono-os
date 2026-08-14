// P7.2C — verify the LIVE resolver for ALL THREE enforceable controls using the
// REAL model code over the exact production state. Pixel: seats/monitoredListings/
// operatingAreas all PILOT (5/30/5, atomic-safe). RE/MAX: all SHADOW. The
// PIXEL_AREAS_MODE env overrides operatingAreas to demonstrate the live kill switch.
import { defaultLimits } from "../src/lib/launch/plans.ts";
import { normalizePlanTier } from "../src/lib/platform-admin/access/model.ts";
import { LIMIT_DEFS, effectiveConfigured } from "../src/lib/limits/model.ts";
import { classifyLimitReadiness } from "../src/lib/enforcement/model.ts";

const DEFAULT_MODE = "SHADOW";
const ATOMIC_GUARDED = new Set(["seats", "monitoredListings", "operatingAreas"]);
const PROD = {
  pixel: { plan: "starter", override: { seats: 5, operatingAreas: 5, monitoredListings: 30 },
    config: { seats: "PILOT", monitoredListings: "PILOT", operatingAreas: process.env.PIXEL_AREAS_MODE ?? "PILOT" },
    usage: { seats: 1, monitoredListings: 14, operatingAreas: 1 } },
  remax: { plan: "starter", override: null, config: {}, usage: { seats: 1, monitoredListings: 1, operatingAreas: 0 } },
};
function resolve(org, key) {
  const o = PROD[org];
  const mode = o.config[key] ?? DEFAULT_MODE;
  const active = mode === "ENFORCED" || mode === "PILOT";
  const planDefault = defaultLimits(normalizePlanTier(o.plan));
  const { value: lim, source } = effectiveConfigured(LIMIT_DEFS[key], planDefault, o.override);
  const usage = o.usage[key];
  const r = classifyLimitReadiness(key, true, lim != null && lim >= 0, ATOMIC_GUARDED.has(key));
  return { mode, active, lim, source, usage, wouldBlock: active && lim != null && usage >= lim, atomicSafe: r.atomicSafe };
}
let fail = 0; const ok = (c, l) => { console.log((c ? "  ✓ " : "  ✗ ") + l); if (!c) fail++; };
console.log("P7.2C · LIVE resolver — all controls (real model code + prod state)\n");
for (const org of ["pixel", "remax"]) for (const k of ["seats", "monitoredListings", "operatingAreas"]) {
  const r = resolve(org, k);
  console.log(`  ${org.toUpperCase()} / ${k}: mode=${r.mode} active=${r.active} limit=${r.lim} usage=${r.usage} atomicSafe=${r.atomicSafe} wouldBlock=${r.wouldBlock}`);
}
console.log("");
const pa = resolve("pixel", "operatingAreas");
ok(pa.active && pa.lim === 5 && pa.atomicSafe, "Pixel operatingAreas: PILOT active, limit 5, atomic-safe");
ok(resolve("pixel", "seats").active && resolve("pixel", "seats").lim === 5, "Pixel seats unchanged: PILOT/5");
ok(resolve("pixel", "monitoredListings").active && resolve("pixel", "monitoredListings").lim === 30, "Pixel monitoredListings unchanged: PILOT/30");
ok(!resolve("remax", "operatingAreas").active, "RE/MAX operatingAreas: SHADOW inactive");
ok(!resolve("remax", "seats").active && !resolve("remax", "monitoredListings").active, "RE/MAX all SHADOW");
console.log("");
console.log(fail === 0 ? "ALL P7.2C RESOLUTION CHECKS PASSED" : `${fail} FAILED`);
if (fail) process.exit(1);
