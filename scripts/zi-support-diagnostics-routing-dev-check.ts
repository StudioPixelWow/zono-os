// ZI Support→Diagnostics routing — dev-check (pure). Verifies category→issue
// mapping and the "run diagnostics?" policy.
//   npx esbuild scripts/zi-support-diagnostics-routing-dev-check.ts --bundle --platform=node --format=cjs | node -
import { issueForCategory, shouldRunDiagnostics, diagnosticPlan } from "../src/lib/zi-expert/support-diagnostics-routing";
import { classifySupportIntentDeterministic as classify } from "../src/lib/zi-expert/support-intent";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, got?: unknown) => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n} → ${JSON.stringify(got)}`); } };

ok("FACEBOOK → provider_sync_failed", issueForCategory("FACEBOOK") === "provider_sync_failed");
ok("PERMISSIONS → permission_denied", issueForCategory("PERMISSIONS") === "permission_denied");
ok("AI_FEATURE → ai_unavailable", issueForCategory("AI_FEATURE") === "ai_unavailable");
ok("OTHER → null", issueForCategory("OTHER") === null, issueForCategory("OTHER"));
ok("ONBOARDING → null (no live check)", issueForCategory("ONBOARDING") === null);

// "הפייסבוק לא עובד" → SUPPORT + requiresAction + FACEBOOK → run diagnostics
const fb = classify("הפייסבוק לא עובד לי");
ok("fb issue → run diagnostics", shouldRunDiagnostics(fb) === true, fb);
ok("fb issue → plan provider_sync_failed", diagnosticPlan(fb) === "provider_sync_failed", diagnosticPlan(fb));

// how-to (no action) → no diagnostics
const howto = classify("איך אני מוסיף נכס?");
ok("how-to → no diagnostics", shouldRunDiagnostics(howto) === false, howto);

// recommendation (PRODUCT lane) → no diagnostics
const reco = classify("על מה כדאי לי להתמקד היום?");
ok("recommendation → no diagnostics", shouldRunDiagnostics(reco) === false, reco);

// permission problem → run + permission_denied
const perm = classify("אין לי הרשאה ולא מצליח");
ok("permission issue → run", shouldRunDiagnostics(perm) === true, perm);
ok("permission issue → permission_denied", diagnosticPlan(perm) === "permission_denied", diagnosticPlan(perm));

console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILURES"} — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
