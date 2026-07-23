// ============================================================================
// 💳 ZONO — Payment status (/register/status?payment=…). Batch 6.4. Reflects the
// VERIFIED server state only: pending/processing → keep waiting; paid+activated
// → go to login; failed/cancelled/expired → retry or change plan (draft kept).
// The browser landing here NEVER activates anything — it only reads status.
// ============================================================================
import { PaymentStatusView } from "./StatusView";

export const dynamic = "force-dynamic";

export default async function PaymentStatusPage({ searchParams }: { searchParams: Promise<{ payment?: string; cancelled?: string }> }) {
  const sp = await searchParams;
  return <PaymentStatusView paymentId={sp.payment ?? null} cancelledHint={sp.cancelled === "1"} />;
}
