// ============================================================================
// ZONO 9.4 — CANONICAL HEBREW ERROR BOUNDARY (pure, client-safe, offline-testable).
// The ONE place that turns any technical failure into a user-safe Hebrew message.
// No feature scatters its own translation; every UI seam (the shared action runner,
// server-action failure shapes, provider errors) funnels through normalizeCanonicalError.
// It NEVER leaks a raw Error/SQL/Supabase/provider/enum/UUID/English string to a user,
// and it NEVER misclassifies an unknown failure as "permission denied". Technical
// detail is preserved by the CALLER (logs/audit) — this module only shapes the copy.
// No I/O, no DB, no session — safe to import from client components.
// ============================================================================

export type UserErrorCode =
  | "PERMISSION_DENIED"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "DUPLICATE"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_AUTH_REQUIRED"
  | "NETWORK_TEMPORARY"
  | "BILLING_RESTRICTED"
  | "TOKEN_EXPIRED"
  | "TOKEN_REVOKED"
  | "ENTITY_INACTIVE"
  | "UNKNOWN_ERROR";

export type ErrorSeverity = "info" | "warning" | "error";

export interface UserSafeError {
  /** Canonical internal code (NEVER shown to the user directly). */
  code: UserErrorCode;
  /** The ONLY string a user surface renders. */
  messageHe: string;
  retryable: boolean;
  severity: ErrorSeverity;
}

const CATALOG: Record<UserErrorCode, { messageHe: string; retryable: boolean; severity: ErrorSeverity }> = {
  PERMISSION_DENIED:      { messageHe: "אין לך הרשאה לבצע את הפעולה הזו", retryable: false, severity: "warning" },
  NOT_FOUND:              { messageHe: "לא מצאנו את הפריט שביקשת", retryable: false, severity: "warning" },
  VALIDATION_FAILED:      { messageHe: "חלק מהפרטים חסרים או אינם תקינים", retryable: false, severity: "warning" },
  DUPLICATE:              { messageHe: "הפריט כבר קיים במערכת", retryable: false, severity: "info" },
  RATE_LIMITED:           { messageHe: "יותר מדי בקשות כרגע. אפשר לנסות שוב בעוד רגע", retryable: true, severity: "warning" },
  PROVIDER_UNAVAILABLE:   { messageHe: "השירות אינו זמין כרגע. אפשר לנסות שוב בעוד רגע", retryable: true, severity: "error" },
  PROVIDER_AUTH_REQUIRED: { messageHe: "נדרש לחבר מחדש את השירות החיצוני", retryable: false, severity: "warning" },
  NETWORK_TEMPORARY:      { messageHe: "לא הצלחנו להשלים את הפעולה כרגע. אפשר לנסות שוב", retryable: true, severity: "error" },
  BILLING_RESTRICTED:     { messageHe: "המנוי ממתין להסדרת תשלום", retryable: false, severity: "warning" },
  TOKEN_EXPIRED:          { messageHe: "הקישור פג תוקף", retryable: false, severity: "warning" },
  TOKEN_REVOKED:          { messageHe: "הקישור אינו פעיל עוד", retryable: false, severity: "warning" },
  ENTITY_INACTIVE:        { messageHe: "הפריט אינו פעיל כרגע", retryable: false, severity: "warning" },
  UNKNOWN_ERROR:          { messageHe: "משהו השתבש. אפשר לנסות שוב בעוד רגע", retryable: true, severity: "error" },
};

/** The canonical Hebrew copy for a code (never the internal code itself). */
export function userErrorHe(code: UserErrorCode): string { return CATALOG[code].messageHe; }

/** Build a canonical user-safe error from a known code. */
export function makeUserError(code: UserErrorCode): UserSafeError {
  const c = CATALOG[code];
  return { code, messageHe: c.messageHe, retryable: c.retryable, severity: c.severity };
}

function isUserSafeError(x: unknown): x is UserSafeError {
  if (!x || typeof x !== "object" || !("code" in x) || !("messageHe" in x)) return false;
  const code = (x as { code: unknown }).code;
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(CATALOG, code);
}

function rawMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") return (err as { message: string }).message;
  return "";
}

const HEBREW = /[֐-׿]/;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const SQL_LEAK = /\b(select|insert|update|delete|from|where|null value|constraint|violates|duplicate key|enum|pgrst|supabase|postgres|sqlstate|jwt|undefined|econn|etimedout|stack|typeerror|referenceerror)\b/i;
const SNAKE_ENUM = /[a-z]+_[a-z]+/i;                 // email_failed / read_only / pages_manage_posts
const THREE_EN_WORDS = /[A-Za-z]{2,}\s+[A-Za-z]{2,}\s+[A-Za-z]{2,}/;

/**
 * A curated app message is safe to show verbatim ONLY when it is Hebrew and carries
 * no technical leakage (UUID, SQL/Supabase terms, snake_case enum, or a run of English
 * words). This preserves specific, useful Hebrew errors (e.g. "נדרשת הרשאת מנהל/בעלים")
 * without ever surfacing a raw technical string.
 */
export function isSafeHebrewMessage(s: string): boolean {
  const t = (s ?? "").trim();
  if (!t || !HEBREW.test(t)) return false;
  if (UUID.test(t) || SQL_LEAK.test(t) || SNAKE_ENUM.test(t) || THREE_EN_WORDS.test(t)) return false;
  return true;
}

/** Keep a specific safe Hebrew message under a detected code; else the canonical copy. */
function withCode(code: UserErrorCode, raw: string): UserSafeError {
  const base = makeUserError(code);
  return isSafeHebrewMessage(raw) ? { ...base, messageHe: raw.trim() } : base;
}

/**
 * Normalize ANY thrown/returned failure into a canonical user-safe Hebrew error.
 * Recognizes typed errors (BillingRestrictedError) and message patterns across the
 * app's providers; unknown/technical failures become UNKNOWN_ERROR (never permission).
 */
export function normalizeCanonicalError(err: unknown): UserSafeError {
  if (isUserSafeError(err)) return err;
  const name = (err && typeof err === "object" ? (err as { name?: string }).name : "") ?? "";
  const raw = rawMessage(err);
  const m = raw.toLowerCase();

  // ── typed / high-signal first ──────────────────────────────────────────────
  if (name === "BillingRestrictedError" || /ממתין להסדרת תשלום/.test(raw)) return makeUserError("BILLING_RESTRICTED");
  if (/rate.?limit|too many requests|\b429\b/.test(m)) return makeUserError("RATE_LIMITED");
  if (/token[_\s-]*expired|expired.*token|הקישור פג תוקף|link expired/.test(m)) return withCode("TOKEN_EXPIRED", raw);
  if (/token[_\s-]*revoked|revoked|אינו פעיל עוד/.test(m)) return withCode("TOKEN_REVOKED", raw);
  if (/reconnect|re-?auth|auth[_\s-]*required|reauthenticate|נדרש לחבר מחדש|נדרשת הרשאת pages|asset_disconnected/.test(m)) return makeUserError("PROVIDER_AUTH_REQUIRED");
  if (/permission|forbidden|unauthorized|not authorized|row-level|rls|\b403\b|אין הרשאה|אין לך הרשאה|נדרשת הרשאת/.test(m)) return withCode("PERMISSION_DENIED", raw);
  if (/not found|\b404\b|לא נמצא|לא מצאנו/.test(m)) return withCode("NOT_FOUND", raw);
  if (/duplicate|unique|כבר קיים/.test(m)) return withCode("DUPLICATE", raw);
  if (/timeout|timed out|etimedout|econnreset|fetch failed|network|socket|unavailable|service unavailable|\b5\d\d\b|graph error|provider error/.test(m)) return makeUserError("PROVIDER_UNAVAILABLE");
  if (/inactive|disabled|suspended|not active|אינו פעיל|הושבת|מושהה/.test(m)) return withCode("ENTITY_INACTIVE", raw);
  if (/validation|invalid|required|missing|malformed|חסר|חסרים|אינם תקינים|לא תקין|שדה חובה/.test(m)) return withCode("VALIDATION_FAILED", raw);

  // ── otherwise: a curated safe Hebrew message may pass through; anything else is
  //    generic (NEVER permission). This is the unknown-error guarantee (§12). ────
  if (isSafeHebrewMessage(raw)) return { code: "UNKNOWN_ERROR", messageHe: raw.trim(), retryable: true, severity: "warning" };
  return makeUserError("UNKNOWN_ERROR");
}

/** Convenience: the user-safe Hebrew string for any failure. */
export function toUserMessageHe(err: unknown): string { return normalizeCanonicalError(err).messageHe; }
