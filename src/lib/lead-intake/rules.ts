// ============================================================================
// ZONO 9.3 — SILENT LEAD-INTAKE OBSERVABILITY · PURE helpers (no I/O, offline-
// testable). Customer-facing Hebrew copy + the sanitized error classifier, shared
// by the server-only observability module and the tests. Nothing here reads a DB,
// a session, or a provider; it never surfaces raw SQL/PII to a customer.
// ============================================================================

/** Customer-facing states (§10) — the ONLY strings a lead form shows. */
export const LEAD_INTAKE_OK = "הפרטים התקבלו בהצלחה";
export const LEAD_INTAKE_RETRY = "לא הצלחנו לשלוח את הפרטים כרגע. אפשר לנסות שוב בעוד רגע.";

/**
 * Map any thrown/returned error into a SANITIZED, non-PII category for logs/audit
 * (never shown to the customer). Deterministic; safe on unknown shapes.
 */
export function classifyLeadError(err: unknown): string {
  const msg = (err instanceof Error ? err.message : typeof err === "string" ? err : (err as { message?: string } | null)?.message ?? "").toLowerCase();
  if (!msg) return "unknown";
  if (/duplicate|unique/.test(msg)) return "duplicate";
  if (/timeout|timed out|etimedout|econnreset|fetch failed|network|socket/.test(msg)) return "db_timeout";
  if (/permission|rls|row-level|security policy|not authorized|jwt|forbidden/.test(msg)) return "db_permission";
  if (/invalid input value for enum|violates|constraint|null value|check|foreign key/.test(msg)) return "db_constraint";
  return "db_error";
}
