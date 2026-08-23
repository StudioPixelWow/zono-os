// Live-data acceptance: run the SHIPPED canonical resolver against real production
// office/territory data (pulled from prod) and compare OLD (script-preserving) vs
// NEW (canonical) territory membership for the three orgs.
import { canonicalLocality } from "../src/lib/geo/locality.ts";
import { cityInTerritory } from "../src/lib/office-intel/office-territory.ts";

// OLD script-preserving fold (pre-5.1) — for the before/after comparison.
const oldNorm = (v: string) => (v ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/י{2,}/g, "י").replace(/ו{2,}/g, "ו");
const oldIn = (city: string, areas: string[]) => { const c = oldNorm(city); return areas.some((a) => oldNorm(a) === c); };

// Real production office cities in the Krayot/Rehovot area (city → office count).
const OFFICES: { city: string; n: number }[] = [
  { city: "Kiryat Bialik", n: 128 },   // English transliteration
  { city: "קריית ביאליק", n: 74 },      // Hebrew ktiv male
  { city: "רחובות", n: 42 },            // Hebrew
];

// Org territories exactly as stored (name_he + name_en, uppercase En as in prod).
const ORGS: { org: string; areas: string[] }[] = [
  { org: "פיקסל", areas: ["קרית ביאליק", "QIRYAT BIALIK"] },
  { org: "רימקס פמילי", areas: ["קרית ביאליק", "QIRYAT BIALIK", "קרית מוצקין", "QIRYAT MOTZKIN"] },
  { org: "לנדסמן רחובות", areas: ["רחובות", "REHOVOT"] },
];

let fail = 0;
const expect = (name: string, cond: boolean) => { if (!cond) { fail++; console.log("  ✗ " + name); } else console.log("  ✓ " + name); };

for (const { org, areas } of ORGS) {
  console.log(`\n▸ ${org}  (territory: ${areas.join(", ")})`);
  let oldTotal = 0, newTotal = 0;
  for (const { city, n } of OFFICES) {
    const wasIn = oldIn(city, areas), isIn = cityInTerritory(city, areas);
    if (wasIn) oldTotal += n;
    if (isIn) newTotal += n;
    console.log(`   ${city.padEnd(16)} ×${String(n).padStart(3)}  OLD=${wasIn ? "IN " : "out"}  NEW=${isIn ? "IN " : "out"}  → canonical="${canonicalLocality(city)}"`);
  }
  console.log(`   offices in territory:  OLD ${oldTotal}  →  NEW ${newTotal}`);
}

console.log("\n── Assertions ──");
// פיקסל: English "Kiryat Bialik" (128) + Hebrew drift (74) both in territory now.
expect("פיקסל: English 'Kiryat Bialik' now IN territory (was OUT)", cityInTerritory("Kiryat Bialik", ["קרית ביאליק", "QIRYAT BIALIK"]) && !oldIn("Kiryat Bialik", ["קרית ביאליק", "QIRYAT BIALIK"]));
expect("פיקסל: Hebrew 'קריית ביאליק' IN territory", cityInTerritory("קריית ביאליק", ["קרית ביאליק", "QIRYAT BIALIK"]));
// no false positives: Rehovot office NOT in פיקסל
expect("פיקסל: 'רחובות' office EXCLUDED (no false positive)", !cityInTerritory("רחובות", ["קרית ביאליק", "QIRYAT BIALIK"]));
// לנדסמן: Rehovot in, Kiryat Bialik out (He + En)
expect("לנדסמן: 'רחובות' IN territory", cityInTerritory("רחובות", ["רחובות", "REHOVOT"]));
expect("לנדסמן: 'Kiryat Bialik' EXCLUDED", !cityInTerritory("Kiryat Bialik", ["רחובות", "REHOVOT"]));
expect("לנדסמן: 'קריית ביאליק' EXCLUDED", !cityInTerritory("קריית ביאליק", ["רחובות", "REHOVOT"]));
// רימקס פמילי: both Krayot in
expect("רימקס: 'Kiryat Bialik' IN", cityInTerritory("Kiryat Bialik", ["קרית ביאליק", "QIRYAT BIALIK", "קרית מוצקין", "QIRYAT MOTZKIN"]));
expect("רימקס: 'רחובות' EXCLUDED", !cityInTerritory("רחובות", ["קרית ביאליק", "QIRYAT BIALIK", "קרית מוצקין", "QIRYAT MOTZKIN"]));

console.log(fail === 0 ? "\n✅ LIVE-DATA ACCEPTANCE PASS" : `\n❌ ${fail} failures`);
if (fail > 0) process.exit(1);
