// ============================================================================
// ZONO — QA-SCOPED BILLING OVERRIDES (pure + env-reading, testable).
//
// Lets us run a REAL ₪1 end-to-end payment against the LIVE production app for a
// single explicit QA org, WITHOUT touching any real customer:
//   • BILLING_QA_ORG_IDS      — comma-separated org UUIDs that are "QA orgs".
//   • BILLING_QA_UNIT_PRICE_ILS — the QA unit price (default 1). Applies ONLY to
//                                 orgs in the allowlist; every other org keeps the
//                                 canonical ₪197 model price.
//
// Why this exists: the global BILLING_UNIT_PRICE_ILS override would make EVERY
// org ₪1, and a global BILLING_ENFORCE_AFTER date would gate EVERY new real
// customer. Both are unsafe in production. These helpers scope the ₪1 price and
// the payment-required enforcement to an explicit allowlist, so a QA run cannot
// affect anyone else. Empty allowlist ⇒ everything behaves exactly as before.
// ============================================================================

/** Parse a comma/space-separated list of org ids from env (trimmed, non-empty). */
export function parseOrgIdList(raw: string | null | undefined = process.env.BILLING_QA_ORG_IDS): string[] {
  return (raw ?? "").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
}

/** True when a QA org allowlist is configured (QA testing mode is active). */
export function qaEnforcementActive(raw: string | null | undefined = process.env.BILLING_QA_ORG_IDS): boolean {
  return parseOrgIdList(raw).length > 0;
}

/** True only for an org explicitly listed in BILLING_QA_ORG_IDS. */
export function isQaOrg(orgId: string | null | undefined, raw: string | null | undefined = process.env.BILLING_QA_ORG_IDS): boolean {
  if (!orgId) return false;
  return parseOrgIdList(raw).includes(orgId);
}

/** QA unit price (₪), default 1, floored at 1 — a bad env can never zero a charge. */
export function qaUnitPriceIls(raw: string | null | undefined = process.env.BILLING_QA_UNIT_PRICE_ILS): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : 1;
}

/** The monthly sum to charge a QA org: billableAgents × QA unit price. */
export function qaExpectedMonthlyIls(billableAgents: number, priceRaw?: string | null): number {
  return Math.max(0, Math.round(billableAgents)) * qaUnitPriceIls(priceRaw);
}
