// ============================================================================
// 🌐 ZONO — Universal Knowledge Graph explorer (/relationships). PHASE 51.0.
// Org-wide, evidence-backed graph overview + drill into any entity's connections.
// Reuses the universal-graph service (which reuses relationship-graph + Truth).
// ============================================================================
import { getUniversalGraphOverview } from "@/lib/universal-graph/service";
import type { UniversalGraphOverview } from "@/lib/universal-graph/types";
import { RelationshipsExplorerView } from "./RelationshipsExplorerView";

export const dynamic = "force-dynamic";

export default async function RelationshipsPage() {
  let overview: UniversalGraphOverview | null = null;
  try { overview = await getUniversalGraphOverview(); } catch (e) { console.error("[relationships] load failed:", e); }
  return <RelationshipsExplorerView overview={overview} />;
}
