import { getDistributionConnectionsAction } from "@/lib/distribution/provider-connections-actions";
import { CONNECTION_COMPLIANCE, type ProviderConnectionView } from "@/lib/distribution/provider-connections";
import { DistributionConnectionsView } from "./DistributionConnectionsView";

export const dynamic = "force-dynamic";

// חיבורי הפצה — Facebook Connection Center (Phase 10.3). Connection MANAGEMENT
// only: no Meta API yet, publishing stays manual via the Publish Assistant.
export default async function DistributionConnectionsPage() {
  let connections: ProviderConnectionView[] = [];
  try {
    connections = await getDistributionConnectionsAction();
  } catch (e) {
    console.error("[distribution-connections] load failed:", e);
  }
  return <DistributionConnectionsView initial={connections} compliance={CONNECTION_COMPLIANCE} />;
}
