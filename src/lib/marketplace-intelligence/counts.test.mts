// ============================================================================
// 🔢 Marketplace header counts — P1-2 acceptance test.
// Run: npx tsx src/lib/marketplace-intelligence/counts.test.mts   (exit 0 = pass)
// ============================================================================
import { buyerMatchCount, acquisitionCount, type CountableOpportunity } from "./counts.ts";

let passed = 0, failed = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
};

// The exact production shape: an acquisition-kind listing that ALSO has buyer
// matches. The old header (kind==='buyer_match') excluded it → header 0 while
// the card printed "2 קונים מתאימים".
const opps: CountableOpportunity[] = [
  { kind: "acquisition", buyerMatches: 2 }, // card shows "2 קונים" but old count missed it
  { kind: "buyer_match", buyerMatches: 1 },
  { kind: "acquisition", buyerMatches: 0 },
  { kind: "watch", buyerMatches: 0 },
];

console.log("\n— P1-2: header count matches what the cards show —");
check("buyerMatchCount counts EVERY listing with ≥1 buyer match (2), not just kind==='buyer_match' (1)",
  buyerMatchCount(opps) === 2);
check("the acquisition-kind listing with 2 matches IS counted",
  buyerMatchCount([{ kind: "acquisition", buyerMatches: 2 }]) === 1);
check("acquisitionCount unchanged (2 acquisition-kind)",
  acquisitionCount(opps) === 2);
check("no buyer matches ⇒ 0 (no false positive)",
  buyerMatchCount([{ kind: "watch", buyerMatches: 0 }]) === 0);
check("empty ⇒ 0",
  buyerMatchCount([]) === 0);

console.log(`\n${failed === 0 ? "🟢" : "🔴"} counts(P1-2): ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
