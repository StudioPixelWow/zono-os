/**
 * LOCAL-DEV-ONLY check for the Agency Foundation (Phase 26.0). Pure layers only
 * (no DB, no network). Verifies: name normalization (HE/EN + legal suffixes) ·
 * slug generation · name similarity · duplicate detection (name/website/phone/
 * email/place) · confidence thresholds.
 *
 * Run: npx tsx scripts/agency-foundation-dev-check.ts
 */
import {
  normalizeAgencyName, agencySlug, normalizePhone, normalizeWebsite,
} from "../src/lib/agencies/normalize";
import { nameSimilarity, duplicateScore, isLikelyDuplicate } from "../src/lib/agencies/duplicate-detection";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

function main(): void {
  console.log("Agency Foundation dev-check\n");

  // 1) Normalization.
  console.log("Normalization:");
  assert(normalizeAgencyName('רי/מקס נדל"ן בע"מ') === normalizeAgencyName("רי מקס"), "HE legal suffixes stripped (רי/מקס נדל\"ן בע\"מ → רי מקס)");
  assert(normalizeAgencyName("Anglo-Saxon Real Estate Ltd") === "anglo saxon", "EN legal suffixes + 'real estate' stripped");
  assert(normalizeAgencyName("  Century   21  ") === "century 21", "whitespace collapsed");
  assert(normalizeAgencyName(null) === "", "null → empty string");

  // 2) Slug.
  console.log("\nSlug:");
  assert(agencySlug("Anglo Saxon") === "anglo-saxon", "latin slug");
  assert(agencySlug("רי מקס") .length > 0 && !agencySlug("רי מקס").includes(" "), "Hebrew slug has no spaces");
  assert(agencySlug("") === "agency", "empty → 'agency' fallback");

  // 3) Phone / website normalization.
  console.log("\nContact normalization:");
  assert(normalizePhone("+972-54-123-4567") === normalizePhone("0541234567"), "phone formats unify");
  assert(normalizeWebsite("https://www.Remax.co.il/") === "remax.co.il", "website host normalized");

  // 4) Name similarity.
  console.log("\nName similarity:");
  assert(nameSimilarity("אנגלו סכסון", "אנגלו סכסון") === 1, "identical names → 1.0");
  assert(nameSimilarity("רי/מקס", "רימקס נכסים") >= 0.5, "near-identical HE names score high");
  assert(nameSimilarity("אנגלו סכסון", "סנצ'ורי 21") < 0.4, "different names score low");

  // 5) Duplicate detection.
  console.log("\nDuplicate detection:");
  const a = { name: "אנגלו סכסון נכסים", website: "anglo.co.il", phone: "03-1234567" };
  const b = { name: "אנגלו סכסון", website: "https://www.anglo.co.il", phone: null };
  const sameWebsite = duplicateScore(a, b);
  assert(sameWebsite.confidence >= 0.9 && sameWebsite.reasons.includes("website"), "same website → high confidence + reason");
  assert(isLikelyDuplicate(a, b), "→ flagged as likely duplicate");
  const c = { name: "רי מקס", phone: "054-9999999" };
  const d = { name: "סנצ'ורי 21", phone: "054-1111111" };
  assert(!isLikelyDuplicate(c, d), "different name + no shared signals → not duplicate");
  const phoneMatch = duplicateScore({ name: "X", phone: "0541234567" }, { name: "Y", phone: "+972541234567" });
  assert(phoneMatch.reasons.includes("phone") && phoneMatch.hardMatch, "shared phone is a hard match");

  console.log(`\n${failures === 0 ? "✅ ALL AGENCY FOUNDATION CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
