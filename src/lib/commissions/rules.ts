// ============================================================================
// ZONO — Commissions · pure rules (no I/O; unit-tested)
// ----------------------------------------------------------------------------
// VAT/net computation + payment-status derivation, extracted so the money math
// is testable without a database. The service imports these.
// ============================================================================
export type PaymentStatus = "pending" | "partial" | "paid" | "overdue";

export const round = (n: number): number => Math.round(n);

export function num(n: number | undefined | null): number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? round(n) : 0;
}

export function computeVatNet(gross: number, vatPct: number, adjustments: number): { gross_amount: number; vat_amount: number; net_amount: number } {
  const g = num(gross);
  const vat_amount = round((g * vatPct) / 100);
  const net_amount = Math.max(0, g + adjustments);
  return { gross_amount: g, vat_amount, net_amount };
}

export function derivePaymentStatus(due: number, collected: number, current: PaymentStatus): PaymentStatus {
  if (due > 0 && collected >= due) return "paid";
  if (collected > 0) return "partial";
  if (current === "overdue") return "overdue";
  return "pending";
}
