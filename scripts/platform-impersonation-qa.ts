/*
 * P5.8 — Support View (Path A) QA (LOCAL, no DB, no network).
 * Proves the pure model: mandatory reason ("other" needs detail), deterministic
 * 15-min expiry, section vocabulary. DB tenancy/capability/read-only/cross-org
 * guarantees are verified separately by the static-binding scan (regression) and
 * the live cross-org DB test.
 * Run: npx tsx scripts/platform-impersonation-qa.ts
 */
import {
  validateReason, composeReason, isValidReason,
  isSessionExpired, sessionRemainingMs, sessionExpiresAtMs,
  SUPPORT_VIEW_MAX_MS, SUPPORT_VIEW_REASONS, SUPPORT_VIEW_SECTIONS, isValidSection,
} from "../src/lib/platform-admin/impersonation/model";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

function main(): void {
  console.log("P5.8 support-view resolver QA\n");

  // ── 1. Reason is mandatory + valid. ──
  assert(isValidReason("technical_issue") && !isValidReason("bogus"), "reason validation");
  assert(validateReason("bogus") !== null, "unknown reason rejected");
  assert(validateReason("technical_issue") === null, "valid category accepted (no detail needed)");

  // ── 2. "other" requires a real free-text explanation. ──
  assert(validateReason("other") !== null, "other with no detail rejected");
  assert(validateReason("other", "  ") !== null, "other with blank detail rejected");
  assert(validateReason("other", "ab") !== null, "other with too-short detail rejected");
  assert(validateReason("other", "לקוח דיווח על באג בתצוגה") === null, "other with real detail accepted");
  assert(composeReason("other", "פרט") === "אחר: פרט", "composeReason includes detail for other");
  assert(composeReason("technical_issue") === "תקלה טכנית", "composeReason label for category");

  // ── 3. Deterministic 15-minute expiry. ──
  const start = "2026-01-01T00:00:00.000Z";
  const startMs = Date.parse(start);
  assert(SUPPORT_VIEW_MAX_MS === 15 * 60 * 1000, "max duration is 15 minutes");
  assert(sessionExpiresAtMs(start) === startMs + SUPPORT_VIEW_MAX_MS, "expiry = started_at + 15m");
  assert(!isSessionExpired(start, startMs + 14 * 60 * 1000), "not expired at 14m");
  assert(isSessionExpired(start, startMs + 15 * 60 * 1000), "expired at exactly 15m");
  assert(isSessionExpired(start, startMs + 20 * 60 * 1000), "expired at 20m");
  assert(sessionRemainingMs(start, startMs + 5 * 60 * 1000) === 10 * 60 * 1000, "remaining computed correctly");
  assert(sessionRemainingMs(start, startMs + 30 * 60 * 1000) === 0, "remaining floors at 0");

  // ── 4. Section vocabulary. ──
  assert(isValidSection("overview") && isValidSection("properties") && !isValidSection("nope"), "section validation");
  assert(SUPPORT_VIEW_SECTIONS.every((d) => d.scope === "org" || d.scope === "user"), "every section declares org/user scope");
  assert(SUPPORT_VIEW_REASONS.length === 6, "6 reason categories");
  // user-scoped sections must be the ones we bind a user column for.
  const userSections = SUPPORT_VIEW_SECTIONS.filter((d) => d.scope === "user").map((d) => d.key);
  assert(userSections.includes("properties") && userSections.includes("leads") && userSections.includes("tasks"), "properties/leads/tasks are user-scoped");

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
