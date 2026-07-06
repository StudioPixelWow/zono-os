// ============================================================================
// 🧠 ZONO — AI Broker Brain page (/brain). PHASE 50.0.
// The action brain: state a strategic goal, get an evidence-backed plan. The plan
// is generated on demand (server action) so the page load stays light.
// ============================================================================
import { BrokerBrainView } from "./BrokerBrainView";

export const dynamic = "force-dynamic";

export default function BrokerBrainPage() {
  return <BrokerBrainView />;
}
