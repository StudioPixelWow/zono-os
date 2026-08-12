/*
 * P5.7 — Support state-machine / validation QA (LOCAL, no DB, no network).
 * Proves the ticket status machine is deterministic (valid transitions, reopen,
 * close), priority escalation requires a reason, only ACTIVE platform operators
 * are assignable, only operator-creatable sources are accepted, and input
 * validation is enforced. DB tenancy checks live in the DAL (reviewed) and are
 * validated post-migration.
 * Run: npx tsx scripts/platform-support-qa.ts
 */
import {
  canTransition, isReopen, isClosing, isActive, requiresReason, isAssignableOperator,
  isOperatorCreatableSource, normalizeCategory, isValidStatus, isValidPriority,
  validateSubject, validateNote,
  TICKET_STATUSES, TICKET_PRIORITIES,
} from "../src/lib/platform-admin/support/model";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

function main(): void {
  console.log("P5.7 support resolver QA\n");

  // ── 1. Valid transitions. ──
  assert(canTransition("open", "in_progress"), "open → in_progress (valid)");
  assert(canTransition("in_progress", "resolved"), "in_progress → resolved (valid)");
  assert(canTransition("waiting_customer", "in_progress"), "waiting_customer → in_progress (valid)");
  assert(canTransition("resolved", "closed"), "resolved → closed (valid)");

  // ── 2. Invalid transitions + self-transition. ──
  assert(!canTransition("open", "open"), "self-transition rejected");
  assert(!canTransition("closed", "resolved"), "closed → resolved (invalid)");
  assert(!canTransition("closed", "waiting_customer"), "closed → waiting_customer (invalid)");

  // ── 3. Reopen + close semantics. ──
  assert(isReopen("closed", "open"), "closed → open = reopen");
  assert(isReopen("resolved", "in_progress"), "resolved → in_progress = reopen");
  assert(!isReopen("open", "in_progress"), "open → in_progress is NOT reopen");
  assert(isClosing("closed") && !isClosing("resolved"), "isClosing only for closed");
  assert(canTransition("closed", "open") && canTransition("resolved", "open"), "reopen paths are allowed transitions");

  // ── 4. Active set (what 'open tickets' counts). ──
  assert(isActive("open") && isActive("in_progress") && isActive("waiting_customer"), "active = open/in_progress/waiting");
  assert(!isActive("resolved") && !isActive("closed"), "resolved/closed are NOT active");

  // ── 5. Priority escalation requires a reason only when escalating to urgent. ──
  assert(requiresReason("normal", "urgent"), "normal → urgent requires reason");
  assert(requiresReason("high", "urgent"), "high → urgent requires reason");
  assert(!requiresReason("urgent", "urgent"), "urgent → urgent does not (no change)");
  assert(!requiresReason("normal", "high"), "normal → high does not require reason");

  // ── 6. Assignment: ONLY active platform operators. ──
  assert(isAssignableOperator({ status: "active" }), "active operator assignable");
  assert(!isAssignableOperator({ status: "suspended" }), "suspended operator NOT assignable");
  assert(!isAssignableOperator(null), "non-operator (null) NOT assignable");

  // ── 7. Source: only operator-creatable sources accepted. ──
  assert(isOperatorCreatableSource("manual_platform") && isOperatorCreatableSource("system_alert"), "manual_platform + system_alert creatable");
  assert(!isOperatorCreatableSource("email") && !isOperatorCreatableSource("whatsapp"), "email/whatsapp NOT operator-creatable (no ingest wiring)");

  // ── 8. Category normalization + validation guards. ──
  assert(normalizeCategory("billing") === "billing" && normalizeCategory("bogus") === "general" && normalizeCategory(null) === "general", "category normalization (unknown → general)");
  assert(isValidStatus("open") && !isValidStatus("nope"), "status validation");
  assert(isValidPriority("urgent") && !isValidPriority("nope"), "priority validation");
  assert(validateSubject("ab") !== null && validateSubject("valid subject") === null, "subject length validation");
  assert(validateNote("") !== null && validateNote("a real note") === null, "note validation");

  // ── 9. Vocab integrity. ──
  assert(TICKET_STATUSES.length === 5 && TICKET_PRIORITIES.length === 4, "5 statuses, 4 priorities (not over-modeled)");

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
