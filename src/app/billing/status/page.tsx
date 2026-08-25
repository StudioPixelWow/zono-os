// ============================================================================
// 💳 ZONO — Billing status (/billing/status?payment=…). 10.0 §15.
// Canonical return landing for the trial→paid GROW checkout of an EXISTING,
// logged-in org (the /register/status page is the NEW-signup equivalent). This
// fixes the 404 that createGrowCheckout's success/cancel URLs pointed at. It NEVER
// activates — activation is the verified webhook's job; this only reflects the
// truth and routes the owner back into their workspace/account. No GROW call here.
// ============================================================================
import { BillingStatusView } from "./BillingStatusView";

export const dynamic = "force-dynamic";

export default async function BillingStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string; cancelled?: string }>;
}) {
  const sp = await searchParams;
  return <BillingStatusView paymentId={sp?.payment ?? null} cancelledHint={sp?.cancelled === "1"} />;
}
