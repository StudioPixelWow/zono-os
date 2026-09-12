// ============================================================================
// ZONO — Org billing OVERVIEW (server-only, READ-ONLY). The single reader the
// customer-facing Billing panel uses: current plan, seats, unit + monthly price,
// trial status/end, subscription status, and real payment + invoice history —
// all from the canonical commercial state + the payments table. No provider calls,
// no mutations. Amounts shown are the commercial EXPECTATION (isTrial-aware); real
// verified revenue is a separate platform concern.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getOrgCommercialState } from "./state";

export interface BillingPaymentRow {
  id: string;
  amountIls: number | null;
  currency: string | null;
  status: string | null;
  verified: boolean;
  environment: string | null;
  createdAt: string | null;
  invoiceNumber: string | null;
  invoiceUrl: string | null;
}

export interface BillingOverview {
  isTrial: boolean;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  subscriptionStatus: string | null;      // active / trial / cancelled / …
  paid: boolean;
  billableAgents: number;
  pricePerAgentIls: number;
  monthlyIls: number | null;              // null when custom pricing required
  customPricingRequired: boolean;
  currentPeriodEnd: string | null;
  payments: BillingPaymentRow[];
  invoices: BillingPaymentRow[];          // payments that produced a tax document
}

const daysLeft = (iso: string | null): number | null => {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
};

export async function getOrgBillingOverview(orgId: string): Promise<BillingOverview> {
  const db = createServiceRoleClient();
  const state = await getOrgCommercialState(orgId);

  const [subRow, payRows] = await Promise.all([
    (db.from("subscriptions" as never).select("status,period_end,trial_ends_at").eq("org_id", orgId).maybeSingle() as unknown as Promise<{ data: { status: string | null; period_end: string | null; trial_ends_at: string | null } | null }>),
    (db.from("payments" as never)
      .select("id,amount_ils,currency,status,verified,environment,created_at,invoice_number,invoice_url")
      .eq("org_id", orgId).order("created_at", { ascending: false }).limit(24) as unknown as Promise<{ data: Array<Record<string, unknown>> | null }>),
  ]);
  const sub = subRow.data;
  const rows: BillingPaymentRow[] = (payRows.data ?? []).map((r) => ({
    id: String(r.id),
    amountIls: r.amount_ils == null ? null : Number(r.amount_ils),
    currency: (r.currency as string | null) ?? null,
    status: (r.status as string | null) ?? null,
    verified: Boolean(r.verified),
    environment: (r.environment as string | null) ?? null,
    createdAt: (r.created_at as string | null) ?? null,
    invoiceNumber: (r.invoice_number as string | null) ?? null,
    invoiceUrl: (r.invoice_url as string | null) ?? null,
  }));

  const subStatus = (sub?.status ?? null);
  const paid = subStatus === "active" && !state.trial.isTrial;

  return {
    isTrial: state.trial.isTrial,
    trialEndsAt: state.trial.endsAt,
    trialDaysLeft: daysLeft(state.trial.endsAt),
    subscriptionStatus: subStatus,
    paid,
    billableAgents: state.billableAgents,
    pricePerAgentIls: state.pricePerAgentIls,
    monthlyIls: state.standardMonthlyIls,
    customPricingRequired: state.customPricingRequired,
    currentPeriodEnd: sub?.period_end ?? null,
    payments: rows,
    invoices: rows.filter((r) => r.invoiceNumber || r.invoiceUrl),
  };
}
