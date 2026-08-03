// ============================================================================
// 📥 CRM import validation — Wave 1 test.
// Run: npx tsx src/lib/import/validation.test.mts   (exit 0 = pass)
// ============================================================================
import { validateRow, validateBatch, type FieldSpec } from "./validation.ts";

let passed = 0, failed = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
};

const spec: FieldSpec[] = [
  { key: "full_name", type: "text", required: true },
  { key: "phone", type: "phone", required: true },
  { key: "email", type: "email" },
  { key: "budget", type: "currency" },
  { key: "rooms", type: "number" },
  { key: "has_parking", type: "boolean" },
  { key: "target_date", type: "date" },
  { key: "city", type: "city" },
  { key: "tags", type: "tags" },
];

console.log("\n— valid row normalizes —");
{
  const r = validateRow(spec, { full_name: "טל זטלמן", phone: "054-636-5333", email: "TAL@X.com", budget: "₪2,300,000", rooms: "4", has_parking: "כן", target_date: "15/03/2026", city: "קרית ביאליק", tags: "hot; investor" });
  check("row ok", r.ok);
  check("phone normalized", r.values.phone === "546365333");
  check("email lowercased", r.values.email === "tal@x.com");
  check("currency stripped ₪ + commas", r.values.budget === 2300000);
  check("number parsed", r.values.rooms === 4);
  check("hebrew boolean כן → true", r.values.has_parking === true);
  check("dd/mm/yyyy → ISO", r.values.target_date === "2026-03-15");
  check("tags split", Array.isArray(r.values.tags) && (r.values.tags as string[]).length === 2);
}

console.log("\n— required + format failures reported (not thrown) —");
check("missing required phone → error", (() => { const r = validateRow(spec, { full_name: "X" }); return !r.ok && r.errors.some((e) => e.includes("phone: required")); })());
check("invalid email → error", (() => { const r = validateRow(spec, { full_name: "X", phone: "0546365333", email: "nope" }); return !r.ok && r.errors.some((e) => e.includes("invalid_email")); })());
check("invalid phone → error", validateRow(spec, { full_name: "X", phone: "12" }).errors.some((e) => e.includes("invalid_phone")));
check("invalid boolean → error", validateRow(spec, { full_name: "X", phone: "0546365333", has_parking: "maybe" }).errors.some((e) => e.includes("invalid_boolean")));
check("invalid date (month 13) → error", validateRow(spec, { full_name: "X", phone: "0546365333", target_date: "15/13/2026" }).errors.some((e) => e.includes("invalid_date")));

console.log("\n— security: formulas rejected, never executed —");
check("formula cell → formula_not_allowed", validateRow(spec, { full_name: "=SUM(A1:A2)", phone: "0546365333" }).errors.some((e) => e.includes("formula_not_allowed")));
check("optional empty field is fine", validateRow(spec, { full_name: "X", phone: "0546365333", email: "" }).ok);

console.log("\n— batch: partial failure isolates bad rows —");
{
  const b = validateBatch(spec, [
    { full_name: "A", phone: "0501111111" },
    { full_name: "B", phone: "bad" },
    { full_name: "", phone: "0502222222" },
  ]);
  check("batch total 3", b.total === 3);
  check("batch valid 1, invalid 2", b.valid === 1 && b.invalid === 2);
  check("valid rows keep index", b.rows[0].ok && b.rows[0].index === 0);
  check("bad rows carry errors", !b.rows[1].ok && !b.rows[2].ok);
}

console.log(`\n${failed === 0 ? "🟢" : "🔴"} import validation: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
