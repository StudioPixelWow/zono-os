/**
 * LOCAL-DEV-ONLY check for the Agency Auto-Builder (Phase 26.2). Pure only.
 * Verifies: RE/MAX HE+EN · Anglo Saxon HE · Keller Williams · generic rejection ·
 * independent-office cleaning · city + branch extraction · alias generation ·
 * provider-name rejection · canonical/display naming.
 *
 * Run: npx tsx scripts/agency-autobuilder-dev-check.ts
 */
import { buildAgencyIdentityFromRawText } from "../src/lib/agencies/identity/agencyAutoBuilder";
import { detectAgencyBrand } from "../src/lib/agencies/identity/agencyBrandDetector";
import { extractAgencyBranchAndCity } from "../src/lib/agencies/identity/agencyNameCleaner";
import { generateAgencyAliases } from "../src/lib/agencies/identity/agencyAliasGenerator";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }
const build = (t: string) => buildAgencyIdentityFromRawText({ rawText: t });

function main(): void {
  console.log("Agency Auto-Builder dev-check\n");

  console.log("Brand detection:");
  assert(detectAgencyBrand("רימקס חלוצים קריות").brandName === "RE/MAX", "Hebrew רימקס → RE/MAX");
  assert(detectAgencyBrand("RE/MAX Halutzim Kiryat Bialik").brandName === "RE/MAX", "English RE/MAX → RE/MAX");
  assert(detectAgencyBrand("אנגלו סכסון חיפה").brandName === "Anglo Saxon", "אנגלו סכסון → Anglo Saxon");
  assert(detectAgencyBrand("KW Israel - Haifa").brandName === "Keller Williams", "KW → Keller Williams");
  assert(detectAgencyBrand("דירה למכירה מהבעלים").brandName === null, "no brand in generic text");

  console.log("\nFull identity builds:");
  const a = build("רימקס חלוצים - קריות");
  assert(!a.rejected && a.brand.brandName === "RE/MAX", "RE/MAX HE builds");
  assert(a.displayName.startsWith("RE/MAX") && a.displayName.includes("חלוצים"), "display = RE/MAX חלוצים");
  assert(a.aliases.some((x) => x.toLowerCase().includes("remax")) && a.aliases.some((x) => x.includes("רימקס")), "aliases include HE+EN variants");

  const b = build("RE/MAX Halutzim Kiryat Bialik");
  assert(!b.rejected && b.location.branch?.toLowerCase() === "halutzim", "EN branch extracted (Halutzim)");
  assert((b.location.city ?? "").toLowerCase().includes("kiryat bialik"), "EN city extracted (Kiryat Bialik)");

  const c = build("אנגלו סכסון חיפה");
  assert(!c.rejected && c.brand.brandName === "Anglo Saxon" && (c.location.city ?? "").includes("חיפה"), "Anglo Saxon + city");

  const ind = build("משפחת לוי נדל\"ן חיפה");
  assert(!ind.rejected && ind.cleanedName.includes("לוי") && !/נדל/.test(ind.cleanedName), "independent office cleaned (noise removed)");

  console.log("\nQuality guards (reject):");
  assert(build("נדלן תיווך נכסים").rejected, "generic-only text rejected");
  assert(build("050-1234567").rejected, "phone-only rejected");
  assert(build("agent@example.com").rejected, "email-only rejected");
  assert(build("Yad2").rejected, "listing platform (Yad2) rejected");
  assert(build("מתווך עצמאי").rejected, "'independent broker' generic rejected");

  console.log("\nBranch/city + aliases helpers:");
  const bc = extractAgencyBranchAndCity("רי/מקס חלוצים קריות");
  assert(bc.branch === "חלוצים" && (bc.city ?? "").includes("קריות"), "branch+city helper");
  const al = generateAgencyAliases({ brand: detectAgencyBrand("RE/MAX"), location: { branch: "חלוצים", city: "קריות", cityMatchedLocality: false }, cleanedName: "RE/MAX חלוצים", displayName: "RE/MAX חלוצים" });
  assert(al.length >= 4, "alias generator yields multiple variants");

  console.log(`\n${failures === 0 ? "✅ ALL AUTO-BUILDER CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
