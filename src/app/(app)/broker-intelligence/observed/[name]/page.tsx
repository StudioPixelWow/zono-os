// ============================================================================
// Observed-broker detail (/broker-intelligence/observed/[name]). The arena keys
// brokers by observed NAME (no canonical id), so this page is name-keyed too: it
// shows everything ZONO OBSERVED for one broker — inventory, territory, property
// mix, price band, activity window and the real listing cards. Org-scoped (RLS),
// evidence-only, no spelling-variant merge.
// ============================================================================
import { notFound } from "next/navigation";
import { getObservedBrokerDetail } from "@/lib/broker-intel/service";
import { ObservedBrokerView } from "./ObservedBrokerView";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ObservedBrokerPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const decoded = decodeURIComponent(name);
  let detail = null;
  try {
    detail = await getObservedBrokerDetail(decoded);
  } catch (e) {
    console.error("[observed-broker] load failed:", e);
  }
  if (!detail) notFound();
  return <ObservedBrokerView detail={detail} />;
}
