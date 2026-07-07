// ============================================================================
// 🤝 ZONO — AI Negotiation Assistant page (/negotiation). PHASE 59.0.
// Pick a property, enter the offers on the table, and get strategy + scripts +
// meeting prep. No legal advice, no fabricated valuations, draft-only messages.
// ============================================================================
import { listNegotiationProperties } from "@/lib/negotiation-assistant/service";
import { NegotiationView } from "./NegotiationView";

export const dynamic = "force-dynamic";

export default async function NegotiationPage() {
  const properties = await listNegotiationProperties().catch(() => []);
  return <NegotiationView properties={properties} />;
}
