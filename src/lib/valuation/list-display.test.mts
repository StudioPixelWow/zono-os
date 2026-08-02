// ============================================================================
// 🏷️ Valuation list-display — P0-3 acceptance test.
// Run: npx tsx src/lib/valuation/list-display.test.mts   (exit 0 = all pass)
// ============================================================================
import { valuationValueLabel, valuationStatusPill, isUnavailable } from "./list-display.ts";

let passed = 0, failed = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
};

console.log("\n— never show ₪0 for a failed/insufficient valuation —");

// The exact production defect: completed + value 0 + valuationAvailable=false.
check("unavailable completed ⇒ value 'לא חושב' (not ₪0)",
  valuationValueLabel({ estimatedValue: 0, valuationAvailable: false, status: "completed" }) === "לא חושב");
check("unavailable completed ⇒ pill 'לא ניתן לחשב' warning (not 'הושלם')",
  (() => { const p = valuationStatusPill({ estimatedValue: 0, valuationAvailable: false, status: "completed" }); return p.label === "לא ניתן לחשב" && p.tone === "warning"; })());

// New honest status.
check("status insufficient_data ⇒ 'לא חושב' + warning pill",
  valuationValueLabel({ estimatedValue: 0, valuationAvailable: false, status: "insufficient_data" }) === "לא חושב"
  && valuationStatusPill({ estimatedValue: 0, valuationAvailable: false, status: "insufficient_data" }).tone === "warning");

// Legacy row: completed, value 0, NO flag (valuationAvailable undefined) — the 3 prod rows.
check("legacy completed+₪0 with no flag ⇒ treated as unavailable",
  isUnavailable({ estimatedValue: 0, valuationAvailable: null, status: "completed" }) === true
  && valuationValueLabel({ estimatedValue: 0, valuationAvailable: null, status: "completed" }) === "לא חושב");

console.log("\n— genuine results still render normally —");
check("valid completed ⇒ ₪ value + 'הושלם' success",
  valuationValueLabel({ estimatedValue: 2296000, valuationAvailable: true, status: "completed" }) === "₪2,296,000"
  && valuationStatusPill({ estimatedValue: 2296000, valuationAvailable: true, status: "completed" }).label === "הושלם");
check("valid with flag undefined but positive value ⇒ shows value",
  valuationValueLabel({ estimatedValue: 3677000, valuationAvailable: null, status: "completed" }) === "₪3,677,000");
check("null value (not failed) ⇒ '—'",
  valuationValueLabel({ estimatedValue: null, valuationAvailable: true, status: "completed" }) === "—");
check("draft ⇒ 'טיוטה' neutral",
  valuationStatusPill({ estimatedValue: null, valuationAvailable: true, status: "draft" }).label === "טיוטה");

console.log(`\n${failed === 0 ? "🟢" : "🔴"} list-display: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
