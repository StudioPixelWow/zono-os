// ============================================================================
// P9.1E — TERRITORY ISOLATION QA (PURE; no DB/network).
// Proves the canonical territory-membership predicate that scopes office
// intelligence to an org's operating market — so a Rehovot org NEVER sees a
// Kiryat Bialik office merely because it exists in the shared global graph.
// Run: npx tsx scripts/p9-1e-territory-isolation-qa.mts
// ============================================================================
import { officeInTerritory, normalizeCityKey } from "../src/lib/brokerage-data/territory-logic.ts";

let fail = 0;
const ok = (c: boolean, l: string) => { console.log((c ? "  ✓ " : "  ✗ ") + l); if (!c) fail++; };

// Landsman Rehovot territory: canonical He + En + provider string.
const rehovot = new Set(["רחובות", "rehovot"].map(normalizeCityKey));
const noBridge = new Set<string>();

console.log("P9.1E · Rehovot org must EXCLUDE foreign-city (Kiryat Bialik) offices");
ok(officeInTerritory({ id: "o1", city: "Rehovot" }, rehovot, noBridge) === true, "Rehovot office → included");
ok(officeInTerritory({ id: "o2", city: "רחובות" }, rehovot, noBridge) === true, "רחובות office → included");
ok(officeInTerritory({ id: "kb1", city: "Kiryat Bialik" }, rehovot, noBridge) === false, "RE/MAX Kiryat Bialik → EXCLUDED");
ok(officeInTerritory({ id: "kb2", city: "קריית ביאליק" }, rehovot, noBridge) === false, "Anglo Saxon קריית ביאליק → EXCLUDED");
ok(officeInTerritory({ id: "kb3", city: "Kiryat Motzkin" }, rehovot, noBridge) === false, "Kiryat Motzkin office → EXCLUDED");
ok(officeInTerritory({ id: "h1", city: "Haifa" }, rehovot, noBridge) === false, "Haifa office → EXCLUDED");

console.log("\nP9.1E · Org bridge overrides city (org observed it through its own listings)");
ok(officeInTerritory({ id: "nat1", city: "Tel Aviv" }, rehovot, new Set(["nat1"])) === true, "office the org actually observed → included regardless of HQ city");
ok(officeInTerritory({ id: "kb1", city: "Kiryat Bialik" }, rehovot, new Set(["other"])) === false, "unrelated bridge id does not include a foreign office");

console.log("\nP9.1E · UNKNOWN ≠ everything (empty territory + no bridge → nothing)");
ok(officeInTerritory({ id: "o1", city: "Rehovot" }, new Set(), noBridge) === false, "no territory + no bridge → EXCLUDED (never global-dump)");

console.log("\nP9.1E · Kiryat Bialik org sees its own territory (isolation is symmetric)");
const kb = new Set(["kiryat bialik", "קריית ביאליק"].map(normalizeCityKey));
ok(officeInTerritory({ id: "kb1", city: "Kiryat Bialik" }, kb, noBridge) === true, "KB org → KB office included");
ok(officeInTerritory({ id: "o1", city: "Rehovot" }, kb, noBridge) === false, "KB org → Rehovot office EXCLUDED");

console.log("\nP9.1E · normalizeCityKey never collapses different-script city names of DIFFERENT cities");
ok(normalizeCityKey("Rehovot") === normalizeCityKey(" rehovot "), "casing/space normalized");
ok(normalizeCityKey("רחובות") !== normalizeCityKey("קריית ביאליק"), "distinct Hebrew cities stay distinct");
ok(normalizeCityKey("Rehovot") !== normalizeCityKey("Kiryat Bialik"), "distinct English cities stay distinct");

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — P9.1E territory isolation QA (${fail} failure${fail === 1 ? "" : "s"})`);
process.exit(fail === 0 ? 0 : 1);
