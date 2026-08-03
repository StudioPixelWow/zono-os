// ============================================================================
// 🧬 Identity resolution — Wave 1 dedup gate test.
// Run: npx tsx src/lib/identity/resolution.test.mts   (exit 0 = pass)
// ============================================================================
import {
  resolveIdentity, normalizePhone, normalizeEmail, normalizeContact,
  type PersonIdentity,
} from "./resolution.ts";

let passed = 0, failed = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
};

const people: PersonIdentity[] = [
  { id: "p-tal", fullName: "טל זטלמן", phones: ["0546365333"], emails: ["tal.pixeld@gmail.com"], sourceIds: ["fb:comment:1"] },
  { id: "p-moshe", fullName: "משה לוי", phones: ["0521234567"], emails: ["moshe@x.com"] },
];

console.log("\n— normalization —");
check("phone +972 == 0-prefixed", normalizePhone("+972546365333") === normalizePhone("0546365333"));
check("phone strips separators", normalizePhone("054-636 5333") === "546365333");
check("email lowercased/validated", normalizeEmail(" TAL.Pixeld@Gmail.com ") === "tal.pixeld@gmail.com");
check("invalid email → null", normalizeEmail("not-an-email") === null);

console.log("\n— link on strong single match —");
check("same phone → link p-tal", (() => { const r = resolveIdentity({ phone: "054-636-5333" }, people); return r.action === "link" && r.match?.personId === "p-tal" && r.match?.confidence === "exact_high"; })());
check("same email (diff phone format) → link p-tal", (() => { const r = resolveIdentity({ email: "tal.pixeld@gmail.com" }, people); return r.action === "link" && r.match?.personId === "p-tal"; })());
check("same sourceId → link (idempotent ingestion)", (() => { const r = resolveIdentity({ sourceId: "fb:comment:1" }, people); return r.action === "link" && r.match?.personId === "p-tal"; })());
check("phone + name agree → exact_high link", (() => { const r = resolveIdentity({ phone: "0546365333", fullName: "טל זטלמן" }, people); return r.action === "link" && r.match?.confidence === "exact_high"; })());

console.log("\n— create when no match —");
check("new phone+email → create", resolveIdentity({ fullName: "רונית בר", phone: "0533334444", email: "ronit@y.com" }, people).action === "create");
check("empty candidate → create", resolveIdentity({}, people).action === "create");

console.log("\n— review, never auto-merge —");
check("same phone but DIFFERENT email (person has email) → conflicting → review",
  (() => { const r = resolveIdentity({ phone: "0546365333", email: "someone.else@x.com" }, people); return r.action === "review" && r.reviewCandidates[0]?.confidence === "conflicting"; })());
check("name-only match → ambiguous → review (never link)",
  (() => { const r = resolveIdentity({ fullName: "טל זטלמן" }, people); return r.action === "review" && r.reviewCandidates.every((m) => m.confidence === "ambiguous"); })());
check("'likely' (phone match, no name) is NOT auto-linked when name absent both sides? still links",
  (() => { const r = resolveIdentity({ phone: "0521234567" }, people); return r.action === "link" && r.match?.personId === "p-moshe"; })());

console.log("\n— multiple confident matches (existing dup) → review —");
{
  const dupPeople: PersonIdentity[] = [
    { id: "d1", fullName: "דנה", phones: ["0500000001"] },
    { id: "d2", fullName: "דנה", phones: ["0500000001"] },
  ];
  const r = resolveIdentity({ phone: "0500000001" }, dupPeople);
  check("two persons same phone → review (surfaces existing duplicate)", r.action === "review" && r.reviewCandidates.length === 2);
}

console.log("\n— org scoping is the caller's job (empty set) —");
check("no existing persons → create", resolveIdentity({ phone: "0546365333" }, []).action === "create");

console.log("\n— determinism —");
check("same input → same result", JSON.stringify(resolveIdentity({ phone: "0546365333" }, people)) === JSON.stringify(resolveIdentity({ phone: "0546365333" }, people)));

console.log(`\n${failed === 0 ? "🟢" : "🔴"} identity resolution: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
