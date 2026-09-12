// ============================================================================
// ZONO — PURE charge-integrity check (no DB, unit-tested). The webhook re-queries
// Grow for the authoritative charged sum; this decides whether that charge may
// activate a subscription. A charge activates ONLY when the amount matches the
// SERVER-computed expected price (within a rounding tolerance) and the currency is
// ILS. Any mismatch → no activation. Kept pure + separate so it can be tested
// without a live payment.
// ============================================================================
export interface ChargeCheckInput {
  expectedIls: number | null | undefined;   // server-computed price for the org/plan/seats
  chargedSum: number | null | undefined;    // authoritative sum from the provider re-query
  currency?: string | null;                 // provider/stored currency
  toleranceIls?: number;                     // rounding tolerance (default ₪1)
}
export interface ChargeCheckResult { ok: boolean; reason: "ok" | "bad_expected" | "bad_charged" | "amount_mismatch" | "bad_currency" }

const CURRENCY_OK = /^(ils|nis|₪|376)$/i;

export function checkChargeAcceptable(input: ChargeCheckInput): ChargeCheckResult {
  const tol = input.toleranceIls ?? 1;
  const expected = Number(input.expectedIls);
  const charged = Number(input.chargedSum);
  // Currency: allow when unset (Israeli Grow defaults to ILS) or explicitly ILS.
  if (input.currency != null && String(input.currency).trim() !== "" && !CURRENCY_OK.test(String(input.currency).trim())) {
    return { ok: false, reason: "bad_currency" };
  }
  if (!Number.isFinite(expected) || expected <= 0) return { ok: false, reason: "bad_expected" };
  if (!Number.isFinite(charged) || charged <= 0) return { ok: false, reason: "bad_charged" };
  if (Math.abs(charged - expected) > tol) return { ok: false, reason: "amount_mismatch" };
  return { ok: true, reason: "ok" };
}
