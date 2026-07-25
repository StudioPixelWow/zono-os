// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 7 · Production GA) · Ops Console (RTL).
// READ-ONLY operational health for the eight Meta queues + dead-letter visibility
// + webhook freshness. Admin/owner-gated via the server action. No token, secret,
// ciphertext, raw payload, or lease token is ever surfaced; nothing is mutated
// here — dead-letter redrive is manual and lives in the existing queue flows.
// ============================================================================
import { getMetaOpsSummaryAction } from "@/lib/meta/ops/actions";
import { OpsConsoleView } from "./OpsConsoleView";

export const dynamic = "force-dynamic";

export default async function MetaOpsPage() {
  const res = await getMetaOpsSummaryAction();
  if (!res.ok) {
    return <main dir="rtl" className="p-8 text-center text-gray-600">{res.error}</main>;
  }
  return <OpsConsoleView summary={res.data} />;
}
