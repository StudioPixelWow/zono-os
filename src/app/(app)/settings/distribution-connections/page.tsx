import { getDistributionConnectionsAction, getFacebookConnectionPathsAction } from "@/lib/distribution/provider-connections-actions";
import { CONNECTION_COMPLIANCE, type ProviderConnectionView } from "@/lib/distribution/provider-connections";
import type { FacebookPathView } from "@/lib/distribution/facebook-connection-paths";
import { getMetaOAuthConfig } from "@/lib/distribution/meta-oauth";
import { DistributionConnectionsView } from "./DistributionConnectionsView";

export const dynamic = "force-dynamic";

// חיבורי הפצה — Facebook Connection Center. Two PARALLEL connection types up top
// (Meta OAuth + Chrome extension), then per-destination provider management.
// Connection MANAGEMENT only — no publishing, no fabricated connected state.
export default async function DistributionConnectionsPage() {
  let connections: ProviderConnectionView[] = [];
  let paths: { meta: FacebookPathView; extension: FacebookPathView } | null = null;
  try {
    [connections, paths] = await Promise.all([
      getDistributionConnectionsAction(),
      getFacebookConnectionPathsAction(),
    ]);
  } catch (e) {
    console.error("[distribution-connections] load failed:", e);
  }
  const metaConfigured = getMetaOAuthConfig().configured;
  return <DistributionConnectionsView initial={connections} compliance={CONNECTION_COMPLIANCE} paths={paths} metaConfigured={metaConfigured} />;
}
