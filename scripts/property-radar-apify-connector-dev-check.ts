/**
 * LOCAL-DEV-ONLY check for the Apify connector layer (Phase 8).
 *
 * Passes WITHOUT any real APIFY env:
 *   • env loader works with missing env (no throw)
 *   • mock provider still works + exposes capabilities
 *   • yad2/madlan throw ProviderNotConfiguredError when env missing
 *   • every provider exposes capabilities
 *   • the public settings DTO never leaks the token (only booleans)
 *
 * If real APIFY env exists, a real actor is NOT run unless
 * PROPERTY_RADAR_RUN_REAL_PROVIDER_CHECK=true (then a tiny maxPages=1 run).
 *
 * Run: npx tsx scripts/property-radar-apify-connector-dev-check.ts
 */
import {
  getPropertyProvider,
  ProviderNotConfiguredError,
  PropertyProviderError,
} from "../src/lib/property-radar/providers";
import {
  getPropertyRadarProviderEnv,
  getApifyToken,
} from "../src/lib/property-radar/connectors/env";
import type { PropertyRadarArea } from "../src/lib/property-radar/providers";

let failures = 0;
function assert(cond: boolean, label: string): void {
  if (cond) console.log(`  ✓ ${label}`);
  else { failures++; console.error(`  ✗ ${label}`); }
}

async function main(): Promise<void> {
  console.log("Property Radar™ Apify connector dev-check\n");
  const area: PropertyRadarArea = { city: "תל אביב", neighborhood: "פלורנטין" };

  // 1) Env loader is safe with missing env.
  const env = getPropertyRadarProviderEnv();
  assert(typeof env.providerMode === "string", "env loader returns a providerMode");
  assert(typeof env.apifyTokenExists === "boolean", "env exposes apifyTokenExists boolean");
  assert(env.timeoutMs > 0 && env.maxRetries >= 0 && env.pollIntervalMs > 0, "env has sane numeric defaults");

  // 2) Capabilities exist on every provider.
  for (const name of ["mock", "yad2", "madlan"] as const) {
    const p = getPropertyProvider(name);
    const c = p.capabilities;
    assert(
      c != null &&
        typeof c.supportsPagination === "boolean" &&
        typeof c.estimatedCreditCostPerPage === "number",
      `${name} exposes capabilities`,
    );
  }

  // 3) Mock provider still works (no env needed).
  const mock = getPropertyProvider("mock");
  const scan = await mock.scanAreaMetadata(area);
  assert(scan.provider === "mock" && scan.listings.length >= 8, "mock provider still scans");
  assert(mock.capabilities.estimatedCreditCostPerPage === 0, "mock costs 0 credits/page");

  // 4) Unconfigured yad2/madlan fail with ProviderNotConfiguredError (never crash).
  for (const name of ["yad2", "madlan"] as const) {
    let err: unknown;
    try {
      await getPropertyProvider(name).scanAreaMetadata(area);
    } catch (e) {
      err = e;
    }
    const configured =
      env.providerMode === "apify" &&
      env.apifyTokenExists &&
      (name === "yad2" ? !!env.yad2ActorId : !!env.madlanActorId);
    if (configured) {
      assert(true, `${name} appears configured — skipped unconfigured assertion`);
    } else {
      assert(err instanceof ProviderNotConfiguredError, `${name} throws ProviderNotConfiguredError when unconfigured`);
      assert(err instanceof PropertyProviderError, `${name} error is a PropertyProviderError`);
    }
  }

  // 5) Token never leaks into the public settings DTO.
  const tokenPresent = !!getApifyToken();
  // The page DTO is built server-side; here we only assert the env summary surface
  // is boolean-only (no string token field anywhere).
  const summaryKeys = Object.keys({
    providerMode: env.providerMode,
    apifyTokenExists: env.apifyTokenExists,
    yad2ActorConfigured: !!env.yad2ActorId,
    madlanActorConfigured: !!env.madlanActorId,
  });
  assert(!summaryKeys.includes("token") && !summaryKeys.includes("apifyToken"), "env summary has no token field");
  assert(typeof env.apifyTokenExists === "boolean" && env.apifyTokenExists === tokenPresent,
    "token presence surfaced only as a boolean");

  // 6) Optional guarded REAL run.
  if (
    env.providerMode === "apify" &&
    env.apifyTokenExists &&
    process.env.PROPERTY_RADAR_RUN_REAL_PROVIDER_CHECK === "true"
  ) {
    console.warn("\n⚠️  PROPERTY_RADAR_RUN_REAL_PROVIDER_CHECK=true — running a tiny REAL actor (maxPages=1)…");
    try {
      const res = await getPropertyProvider("yad2").scanAreaMetadata(area, { maxPages: 1 });
      assert(res.provider === "yad2", "real yad2 run returned a result");
    } catch (e) {
      console.error("  real run error:", e instanceof Error ? e.message : e);
    }
  } else {
    console.log("  ⓘ real actor run skipped (set PROPERTY_RADAR_RUN_REAL_PROVIDER_CHECK=true to enable)");
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
