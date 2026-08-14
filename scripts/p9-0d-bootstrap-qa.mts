// P9.0D — AUTOMATIC CITY BOOTSTRAP QA (PURE; no DB/network). Source-level guards
// proving the onboarding bootstrap is wired, non-blocking, free/internal-only,
// and never launches an expensive provider scan at signup (cost guard).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

let fail = 0;
const ok = (c: boolean, l: string) => { console.log((c ? "  ✓ " : "  ✗ ") + l); if (!c) fail++; };
const here = dirname(fileURLToPath(import.meta.url));
const onboarding = readFileSync(join(here, "../src/lib/onboarding/actions.ts"), "utf8");

console.log("P9.0D · onboarding fires the FREE city bootstrap");
ok(/triggerCityLearning\(/.test(onboarding), "wires triggerCityLearning at onboarding");
ok(/onboarding_primary_city/.test(onboarding), "uses the onboarding_primary_city reason");
ok(/ensureNationalNeighborhoods/.test(onboarding), "still runs neighborhood discovery (free set)");

console.log("\nP9.0D · non-blocking (does not block onboarding/redirect)");
ok(/\bafter\(/.test(onboarding), "city bootstrap scheduled via after() — non-blocking");
ok(/from "next\/server"/.test(onboarding), "imports after from next/server");

console.log("\nP9.0D · COST GUARD — provider scan is gated + bounded");
ok(/if \(process\.env\.APIFY_TOKEN\)/.test(onboarding),
  "the external scan is GATED on APIFY_TOKEN (clean no-op when unconfigured)");
ok(/syncExternalListingsForOrganization\([^)]*\{ mode: "(quick|standard)" \}/.test(onboarding),
  "the one-time signup scan uses a BOUNDED mode (quick/standard, ≤250/city), not full/backfill");
ok(!/mode: "full"|mode: "backfill"/.test(onboarding),
  "onboarding never launches full/backfill (unbounded) scans");
ok(!/property-radar|PROPERTY_RADAR_PROVIDER/i.test(onboarding),
  "onboarding does NOT launch Property Radar (requires provider config)");

console.log("\nP9.0D · city derived server-side (not from arbitrary browser input)");
// bootstrap cities come from the server-validated `localities` payload processed
// into operating localities — never a raw client-supplied authoritative city.
ok(/bootstrapCities = localities\.map/.test(onboarding), "bootstrap cities derived from server-side localities");

console.log(`\n${fail === 0 ? "✅ P9.0D BOOTSTRAP QA PASSED" : `❌ P9.0D QA FAILED (${fail})`}`);
process.exit(fail === 0 ? 0 : 1);
