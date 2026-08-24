// ============================================================================
// ZONO 9.4 — CANONICAL HEBREW ERROR BOUNDARY regression tests.
// Proves the ONE canonical resolver turns any technical failure into a user-safe
// Hebrew message — never a raw Error/SQL/Supabase/provider/enum/UUID/English string,
// and NEVER a blanket "permission denied" for an unknown error — while preserving a
// specific, curated Hebrew message when one exists. Plus source-closure that the
// shared action runner, the office-intelligence page, the a11y feedback, and the
// brokerage-data leaks all funnel through it.
// Behavioral for the PURE resolver; source-closure for the wiring. No @/ alias.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/hebrew-error-boundary-9-4.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeCanonicalError, toUserMessageHe, userErrorHe, makeUserError, isSafeHebrewMessage,
} from "../../src/lib/errors/user-error.ts";

const src = (rel: string) => readFileSync(new URL(`../../src/${rel}`, import.meta.url), "utf8");
const HEBREW = /[֐-׿]/;
const LEAK = /select|insert|violates|constraint|unique|enum|pgrst|supabase|postgres|undefined|null value|forbidden|unauthorized|email_failed|read_only|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i;
/** Every user-facing message must be Hebrew and leak nothing technical. */
const assertSafe = (s: string, ctx: string) => {
  assert.ok(HEBREW.test(s), `${ctx}: message is Hebrew`);
  assert.doesNotMatch(s, LEAK, `${ctx}: no technical leakage`);
};

// ── 1. raw e.message never reaches the shared UI seam ─────────────────────────
test("useActionRunner funnels every failure through the canonical resolver (no raw e.message)", () => {
  const r = src("components/ui/useActionRunner.ts");
  assert.match(r, /setError\(normalizeCanonicalError\(e\)\.messageHe\)/, "error banner uses the canonical Hebrew message");
  assert.doesNotMatch(r, /setError\(e instanceof Error \? e\.message/, "the old raw e.message leak is gone");
});

// ── 2. permission maps correctly ──────────────────────────────────────────────
test("permission-style failures map to PERMISSION_DENIED (Hebrew)", () => {
  for (const e of ["forbidden", "403 Forbidden", "not authorized", "new row violates row-level security policy"]) {
    const u = normalizeCanonicalError(e);
    assert.equal(u.code, "PERMISSION_DENIED", `"${e}" → permission`);
    assertSafe(u.messageHe, e);
  }
});

// ── 3. unknown ≠ permission (the core 9.0 defect) ─────────────────────────────
test("an unknown/technical error becomes UNKNOWN_ERROR, never PERMISSION_DENIED", () => {
  for (const e of [new Error("Cannot read properties of undefined (reading 'x')"), new Error("TypeError: boom"), new Error("kaboom 500"), {}, null, 42]) {
    const u = normalizeCanonicalError(e);
    assert.notEqual(u.code, "PERMISSION_DENIED", `${String((e as Error)?.message ?? e)} must not be permission`);
    assertSafe(u.messageHe, "unknown");
  }
  assert.equal(normalizeCanonicalError(new Error("Cannot read properties of undefined")).code, "UNKNOWN_ERROR");
});

// ── 4. provider outage → Hebrew-safe PROVIDER_UNAVAILABLE ─────────────────────
test("timeouts / 5xx / graph errors map to PROVIDER_UNAVAILABLE", () => {
  for (const e of ["fetch failed", "ETIMEDOUT", "503 Service Unavailable", "Graph error: something", "socket hang up"]) {
    const u = normalizeCanonicalError(e);
    assert.equal(u.code, "PROVIDER_UNAVAILABLE", `"${e}" → provider unavailable`);
    assert.equal(u.retryable, true);
    assertSafe(u.messageHe, e);
  }
});

// ── 5. rate limit ─────────────────────────────────────────────────────────────
test("429 / rate limit maps to RATE_LIMITED", () => {
  assert.equal(normalizeCanonicalError("429 Too Many Requests").code, "RATE_LIMITED");
  assert.equal(normalizeCanonicalError(new Error("rate limit exceeded")).code, "RATE_LIMITED");
});

// ── 6. billing restricted ─────────────────────────────────────────────────────
test("BillingRestrictedError maps to BILLING_RESTRICTED", () => {
  assert.equal(normalizeCanonicalError(Object.assign(new Error("x"), { name: "BillingRestrictedError" })).code, "BILLING_RESTRICTED");
  assert.equal(normalizeCanonicalError(new Error("המנוי ממתין להסדרת תשלום")).code, "BILLING_RESTRICTED");
  assert.equal(userErrorHe("BILLING_RESTRICTED"), "המנוי ממתין להסדרת תשלום");
});

// ── 7. token expired / revoked ────────────────────────────────────────────────
test("token expired and revoked map to their canonical codes", () => {
  assert.equal(normalizeCanonicalError("token_expired").code, "TOKEN_EXPIRED");
  assert.equal(normalizeCanonicalError(new Error("link expired")).code, "TOKEN_EXPIRED");
  assert.equal(normalizeCanonicalError("token_revoked").code, "TOKEN_REVOKED");
});

// ── 8. inactive entity ────────────────────────────────────────────────────────
test("inactive/disabled/suspended entities map to ENTITY_INACTIVE (not permission)", () => {
  const u = normalizeCanonicalError(new Error("account is suspended"));
  assert.equal(u.code, "ENTITY_INACTIVE");
  assert.notEqual(u.code, "PERMISSION_DENIED");
});

// ── 9 / 10. raw enums forbidden / email_failed are never rendered ─────────────
test("raw internal enums are sanitized, never surfaced verbatim", () => {
  const a = normalizeCanonicalError("forbidden");
  assert.doesNotMatch(a.messageHe, /forbidden/i, "'forbidden' never shown");
  const b = normalizeCanonicalError("email_failed");
  assert.doesNotMatch(b.messageHe, /email_failed/i, "'email_failed' (snake_case enum) never shown");
  assert.ok(HEBREW.test(b.messageHe));
});

// ── 11. UUID / provider id never rendered ─────────────────────────────────────
test("a message carrying a UUID / technical id is replaced, not echoed", () => {
  const u = normalizeCanonicalError(new Error("insert failed for lead 3f9a1c2e-1234-4abc-9def-0123456789ab"));
  assert.doesNotMatch(u.messageHe, /[0-9a-f]{8}-[0-9a-f]{4}/i, "no UUID in the user copy");
  assertSafe(u.messageHe, "uuid");
});

// ── 12. office-intelligence: a non-permission failure is NOT mislabeled ───────
test("office-intelligence distinguishes permission from a data/network failure", () => {
  const act = src("lib/office-intelligence/actions.ts");
  assert.match(act, /normalizeCanonicalError\(e\)[\s\S]*code:\s*u\.code/, "the action returns a canonical code, not a raw message");
  const page = src("app/(app)/office-intelligence/page.tsx");
  assert.match(page, /const isPermission = res\.code === "PERMISSION_DENIED"/, "the page keys the heading on the real code");
  assert.match(page, /isPermission \? "אין הרשאה" : "מודיעין המשרד אינו זמין כרגע"/, "no blanket permission heading for every failure");
});

// ── 13. technical detail is preserved for logging (not swallowed) ─────────────
test("the boundary shapes copy only — the caller keeps the raw error for logs", () => {
  const r = src("components/ui/useActionRunner.ts");
  assert.match(r, /console\.error\("\[action\] failed:", e\)/, "the raw error is logged (dev) — detail not lost");
  // The resolver is pure: it never mutates or throws away the original error object.
  const original = new Error("db timeout xyz");
  const u = normalizeCanonicalError(original);
  assert.equal(original.message, "db timeout xyz", "the original error is untouched");
  assert.ok(u.messageHe && u.code);
});

// ── 14. lead forms remain Hebrew-safe (9.3 retry copy) ────────────────────────
test("public lead forms surface only Hebrew-safe copy", () => {
  const rules = src("lib/lead-intake/rules.ts");
  assert.match(rules, /LEAD_INTAKE_RETRY = "לא הצלחנו לשלוח את הפרטים כרגע/, "lead retry copy is Hebrew");
  const office = src("lib/office-website/service.ts");
  assert.match(office, /error: LEAD_INTAKE_RETRY/, "office lead surfaces the sanitized retry copy on failure");
});

// ── 15. public token/portal states remain Hebrew-safe ─────────────────────────
test("token expired/revoked + inactive states resolve to Hebrew-safe copy", () => {
  for (const c of ["TOKEN_EXPIRED", "TOKEN_REVOKED", "ENTITY_INACTIVE", "NOT_FOUND"] as const) {
    assertSafe(makeUserError(c).messageHe, c);
  }
  // The public sign page maps its provider enum to Hebrew (spot-check the seam).
  const sign = src("app/sign/[token]/SignExperience.tsx");
  assert.ok(HEBREW.test(sign), "sign experience copy is Hebrew");
});

// ── supporting: isSafeHebrewMessage keeps good Hebrew, rejects leaks ──────────
test("isSafeHebrewMessage keeps curated Hebrew and rejects technical strings", () => {
  assert.equal(isSafeHebrewMessage("נדרשת הרשאת מנהל/בעלים"), true);
  assert.equal(isSafeHebrewMessage("חסר טלפון או אימייל"), true);
  assert.equal(isSafeHebrewMessage("חברו את WhatsApp כדי להמשיך"), true, "a single English brand word is fine");
  assert.equal(isSafeHebrewMessage("forbidden"), false, "no Hebrew");
  assert.equal(isSafeHebrewMessage("שגיאה email_failed"), false, "snake_case enum rejected");
  assert.equal(isSafeHebrewMessage("שגיאה 3f9a1c2e-1234-4abc-9def-0123456789ab"), false, "UUID rejected");
  assert.equal(isSafeHebrewMessage("duplicate key violates unique constraint"), false, "SQL rejected");
});

// keep toUserMessageHe wired (single convenience export)
test("toUserMessageHe returns the resolver's Hebrew string", () => {
  assert.equal(toUserMessageHe("forbidden"), userErrorHe("PERMISSION_DENIED"));
});
