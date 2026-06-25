/**
 * LOCAL-DEV-ONLY check for the Property Radar™ provider layer (Phase 2).
 *
 * Exercises the provider registry + mock provider WITHOUT touching the network,
 * Supabase, or any credits. It verifies the architecture is wired correctly:
 *   • getPropertyProvider('mock') returns a working provider
 *   • the mock scan returns deterministic listings (same output twice)
 *   • fetchListingDetails works for a known id
 *   • an unknown id throws ProviderListingNotFoundError
 *   • getPropertyProvider('yad2' | 'madlan') return placeholders that throw
 *     ProviderNotImplementedError
 *
 * Run:
 *   npx tsx scripts/property-radar-dev-check.ts
 *
 * NOTE: the 'mock' provider returns FABRICATED data for testing only. It is never
 * real market data and must never be seeded into production.
 */
import {
  getPropertyProvider,
  validateNormalizedListingMetadata,
  ProviderListingNotFoundError,
  ProviderNotImplementedError,
} from "../src/lib/property-radar/providers";
import type { PropertyRadarArea } from "../src/lib/property-radar/providers";

let failures = 0;
function assert(cond: boolean, label: string): void {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}`);
  }
}

async function main(): Promise<void> {
  const area: PropertyRadarArea = { city: "תל אביב", neighborhood: "פלורנטין" };

  console.log("Property Radar™ provider dev-check\n");

  // 1. mock provider resolves + scans
  const mock = getPropertyProvider("mock");
  assert(mock.providerName === "mock", "getPropertyProvider('mock') → mock provider");

  const scan = await mock.scanAreaMetadata(area);
  assert(scan.provider === "mock", "scan result tagged provider=mock");
  assert(scan.creditsUsedEstimate === 0, "mock scan costs 0 credits");
  assert(scan.listings.length >= 8, `mock scan returns ≥8 listings (got ${scan.listings.length})`);

  const types = new Set(scan.listings.map((l) => l.listingType));
  assert(types.has("private") && types.has("broker") && types.has("project"),
    "listings include private + broker + project");
  assert(scan.listings.some((l) => !l.imageUrl), "at least one listing has no image");
  assert(scan.listings.every((l) => validateNormalizedListingMetadata(l).valid),
    "every listing passes metadata validation");

  // 2. deterministic — identical output on a second scan
  const scan2 = await mock.scanAreaMetadata(area);
  assert(JSON.stringify(scan.listings) === JSON.stringify(scan2.listings),
    "mock scan is deterministic (identical on re-run)");

  // 3. fetchListingDetails for a known id
  const known = scan.listings[0]!.externalId;
  const details = await mock.fetchListingDetails(known);
  assert(details.externalId === known, "fetchListingDetails returns the known listing");
  assert(typeof details.description === "string" && details.description.length > 0,
    "details include a description");
  assert(Array.isArray(details.images), "details include an images array");

  // 4. unknown id throws ProviderListingNotFoundError
  let notFoundThrown = false;
  try {
    await mock.fetchListingDetails("mock-does-not-exist");
  } catch (e) {
    notFoundThrown = e instanceof ProviderListingNotFoundError;
  }
  assert(notFoundThrown, "unknown id throws ProviderListingNotFoundError");

  // 5. yad2 / madlan placeholders throw ProviderNotImplementedError
  for (const name of ["yad2", "madlan"] as const) {
    const p = getPropertyProvider(name);
    assert(p.providerName === name, `getPropertyProvider('${name}') → placeholder`);
    let thrown = false;
    try {
      await p.scanAreaMetadata(area);
    } catch (e) {
      thrown = e instanceof ProviderNotImplementedError;
    }
    assert(thrown, `${name}.scanAreaMetadata throws ProviderNotImplementedError`);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
