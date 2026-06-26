/**
 * LOCAL-DEV-ONLY check for the Agency Identity Resolver (Phase 26.1). Pure only
 * (no DB). Verifies: exact-name resolution · alias resolution · near-name match
 * within review band · unrelated text → no match · ranking order · status bands.
 *
 * Run: npx tsx scripts/agency-resolver-dev-check.ts
 */
import { resolveAgencyText, RESOLVE_ACCEPT } from "../src/lib/agencies/resolver/resolver";
import { normalizeAgencyName } from "../src/lib/agencies/normalize";
import type { KnownAgency } from "../src/lib/agencies/resolver/types";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

const mk = (id: string, name: string, aliases: string[] = []): KnownAgency => ({
  id, name, normalizedName: normalizeAgencyName(name), aliases: aliases.map(normalizeAgencyName),
});

function main(): void {
  console.log("Agency Resolver dev-check\n");
  const known: KnownAgency[] = [
    mk("a1", "אנגלו סכסון חיפה", ["Anglo Saxon Haifa", "אנגלו סכסון"]),
    mk("a2", "רי/מקס חלוצים", ["Remax Halutzim", "רימקס חלוצים"]),
    mk("a3", "סנצ'ורי 21 הצפון"),
  ];

  console.log("Exact + near name:");
  const r1 = resolveAgencyText("אנגלו סכסון חיפה", known);
  assert(r1.bestMatch?.agencyId === "a1" && r1.bestMatch!.confidence >= RESOLVE_ACCEPT, "exact name → a1 accepted");
  assert(r1.status === "accepted", "status accepted for exact match");

  console.log("\nAlias resolution:");
  const r2 = resolveAgencyText("Remax Halutzim", known);
  assert(r2.bestMatch?.agencyId === "a2", "english alias resolves to רי/מקס חלוצים");
  assert(r2.bestMatch?.reasons.some((x) => x.startsWith("alias")), "alias reason recorded");

  console.log("\nNear / variant:");
  const r3 = resolveAgencyText("רימקס חלוצים קריות", known);
  assert(r3.bestMatch?.agencyId === "a2", "Hebrew variant + extra city still resolves to a2");

  console.log("\nNo match:");
  const r4 = resolveAgencyText("משרד עורכי דין כהן", known);
  assert(r4.bestMatch === null && r4.status === "pending", "unrelated text → no match, pending");

  console.log("\nRanking:");
  const r5 = resolveAgencyText("אנגלו סכסון", known);
  assert(r5.candidates.length > 0 && r5.candidates[0].agencyId === "a1", "best candidate ranked first");

  console.log(`\n${failures === 0 ? "✅ ALL AGENCY RESOLVER CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
