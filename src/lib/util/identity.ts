// ============================================================================
// ZONO — CENTRAL identity normalization (PURE, client-safe, dependency-free).
// The single source of truth for comparing phones and emails across broker
// matching, claim, dedup and directory reconciliation — so "0501234567",
// "050-123-4567", "+972501234567" and "972501234567" all compare equal, and every
// module uses the SAME rule instead of its own local copy. Names use
// normalizeHebrewName (@/lib/broker/engine); localities use canonicalLocality
// (@/lib/geo/locality) — those three together are the canonical identity set.
// ============================================================================

/** Canonical Israeli phone key: bare national number (no +, spaces, dashes, and
 *  no 972 / leading-0 prefix). Empty string when there are no usable digits. */
export function normalizePhoneIL(raw: string | null | undefined): string {
  if (!raw) return "";
  let d = String(raw).replace(/\D/g, "");
  if (d.startsWith("972")) d = d.slice(3);
  while (d.startsWith("0")) d = d.slice(1);
  return d;
}

/** True when two phone strings denote the same Israeli number (canonical-equal). */
export function samePhoneIL(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizePhoneIL(a);
  return na.length >= 6 && na === normalizePhoneIL(b);
}

/** Lowercased, trimmed email for comparison; empty when not an address. */
export function normalizeEmailAddr(raw: string | null | undefined): string {
  const e = (raw ?? "").trim().toLowerCase();
  return e.includes("@") ? e : "";
}

/** True when two emails are the same address (case-insensitive). */
export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeEmailAddr(a);
  return !!na && na === normalizeEmailAddr(b);
}
