// ============================================================================
// ZONO — People · pure identity keys (no I/O; unit-tested)
// ----------------------------------------------------------------------------
// Normalized contact keys used to unify a person across buyers/sellers/leads.
// ============================================================================

/** Normalize an Israeli phone to a comparable key (digits; drop 972/leading 0). */
export function normPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("972")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return d.length >= 6 ? d : null;
}

export function normEmail(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return e.includes("@") ? e : null;
}
