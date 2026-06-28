// ============================================================================
// 🌍 /intelligence-explorer — the discovery experience.
// Presentation only: one server load of existing intelligence (brokers, offices,
// neighborhoods, listings, opportunities) → in-memory search/filter/sort client.
// No new intelligence, no duplicated queries.
// ============================================================================
import { getIntelligenceExplorer } from "@/lib/intelligence-explorer/service";
import { IntelligenceExplorerView } from "./IntelligenceExplorerView";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export default async function IntelligenceExplorerPage() {
  const data = await getIntelligenceExplorer();
  return <IntelligenceExplorerView data={data} />;
}
