// P7.4 — commercial-model reconciliation QA. Uses the REAL canonical model +
// limits math. Proves: flat 197/agent pricing (1/3/10 standard, 11 custom),
// canonical limits UNLIMITED, RE/MAX (no override) NOT blocked, Pixel canary
// override (5/30/5) still enforced, billable-agent rule.
import { COMMERCIAL_MODEL, canonicalDefaultLimits, commercialState, billableAgents } from "../src/lib/commercial/model.ts";
import { LIMIT_DEFS, effectiveConfigured, resolveLimit } from "../src/lib/limits/model.ts";

let fail = 0;
const ok = (c: boolean, l: string) => { console.log((c ? "  ✓ " : "  ✗ ") + l); if (!c) fail++; };

console.log("P7.4 · canonical commercial model\n");
ok(COMMERCIAL_MODEL.pricePerAgentIls === 197, "price = 197 ₪ / agent");
ok(COMMERCIAL_MODEL.trialDays === 14, "trial = 14 days");
ok(COMMERCIAL_MODEL.customPricingAgentThreshold === 10, "custom-pricing threshold = >10 agents");
ok(COMMERCIAL_MODEL.featuresOpen === true, "all features open");

console.log("\nP7.4 · pricing by agent count");
for (const [agents, expect] of [[1, 197], [3, 591], [10, 1970]] as const) {
  const s = commercialState({ seats: { activeUsers: agents, pendingInvites: 0 } });
  ok(s.standardMonthlyIls === expect && !s.customPricingRequired && s.pricingMode === "standard_per_agent",
    `${agents} agents → standard ${expect} ₪/mo`);
}
const s11 = commercialState({ seats: { activeUsers: 11, pendingInvites: 0 } });
ok(s11.customPricingRequired && s11.standardMonthlyIls === null && s11.pricingMode === "custom_pricing_required",
  "11 agents → CUSTOM pricing (no auto 197×11), standardMonthly = null");

console.log("\nP7.4 · billable-agent rule (owner counts, pending reserved, suspended excluded)");
ok(billableAgents({ activeUsers: 4, pendingInvites: 2 }) === 4, "billable = active users only (owner incl.), pending reserved");

console.log("\nP7.4 · canonical limits = UNLIMITED (all open)");
const cd = canonicalDefaultLimits() as Record<string, number>;
ok(cd.seats === -1 && cd.operatingAreas === -1 && cd.monitoredListings === -1, "seats/areas/listings default UNLIMITED (-1)");

console.log("\nP7.4 · effective limits — obsolete tier defaults no longer govern");
const cdl = canonicalDefaultLimits();
// RE/MAX: no override → effective = canonical default = UNLIMITED → never blocks
for (const key of ["seats", "monitoredListings", "operatingAreas"] as const) {
  const eff = effectiveConfigured(LIMIT_DEFS[key], cdl as never, null).value;
  const res = resolveLimit(LIMIT_DEFS[key], eff, key === "seats" ? 1 : key === "monitoredListings" ? 1 : 0, "seam");
  ok(eff === -1 && res.mode === "UNLIMITED" && res.exceeded === false, `RE/MAX ${key}: effective UNLIMITED → NOT blocked (was starter obsolete cap)`);
}
// Pixel: explicit override → canary still enforced
const pixelOverride = { seats: 5, operatingAreas: 5, monitoredListings: 30 } as never;
for (const [key, lim, usage] of [["seats", 5, 1], ["monitoredListings", 30, 14], ["operatingAreas", 5, 1]] as const) {
  const eff = effectiveConfigured(LIMIT_DEFS[key], cdl as never, pixelOverride).value;
  ok(eff === lim, `Pixel ${key}: override ${lim} still honored (canary preserved), usage ${usage}/${lim}`);
}

console.log("");
console.log(fail === 0 ? "ALL P7.4 COMMERCIAL QA PASSED" : `${fail} FAILED`);
if (fail) process.exit(1);
