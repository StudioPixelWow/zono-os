// ZI Support Bridge core — dev-check (pure). Verifies severity→priority mapping
// and the ticket draft (subject/category/priority/transcript/zero-repetition).
//   npx esbuild scripts/zi-support-bridge-dev-check.ts --bundle --platform=node --format=cjs | node -
import { severityToPriority, buildZiTicketDraft } from "../src/lib/zi-expert/support-bridge-core";
import { classifySupportIntentDeterministic as classify } from "../src/lib/zi-expert/support-intent";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, got?: unknown) => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}  → ${JSON.stringify(got)}`); } };

ok("sev CRITICAL→urgent", severityToPriority("CRITICAL") === "urgent");
ok("sev HIGH→high", severityToPriority("HIGH") === "high");
ok("sev NORMAL→normal", severityToPriority("NORMAL") === "normal");
ok("sev LOW→low", severityToPriority("LOW") === "low");

const cls = classify("הפייסבוק לא עובד לי");
const draft = buildZiTicketDraft({
  classification: cls,
  question: "הפייסבוק לא עובד לי",
  summary: "החיבור לפייסבוק פג תוקף",
  transcript: [
    { role: "user", content: "הפייסבוק לא עובד לי" },
    { role: "assistant", content: "בדקתי — החיבור פג תוקף" },
    { role: "user", content: "חיברתי מחדש וזה עדיין לא עובד" },
  ],
  context: { route: "/settings/distribution-connections", moduleLabel: "חיבורי הפצה", roleLabel: "בעלים", plan: "pro" },
});
ok("draft category lowercased", draft.category === "facebook", draft.category);
ok("draft priority from severity", draft.priority === severityToPriority(cls.severity), draft.priority);
ok("draft subject has category label", draft.subject.includes("[פייסבוק]"), draft.subject);
ok("draft subject uses summary", draft.subject.includes("פג תוקף"), draft.subject);
ok("draft includes transcript", draft.description.includes("תמליל השיחה") && draft.description.includes("לקוח:") && draft.description.includes("ZI:"), null);
ok("draft includes context", draft.description.includes("חיבורי הפצה") && draft.description.includes("בעלים"), null);
ok("draft zero-repetition note", draft.description.includes("נפתח אוטומטית על ידי ZI"), null);

const critical = classify("מישהו נכנס לי לחשבון, חשד לפריצה");
const cdraft = buildZiTicketDraft({ classification: critical, question: "חשד לפריצה" });
ok("security → urgent priority", cdraft.priority === "urgent", cdraft.priority);

console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILURES"} — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
