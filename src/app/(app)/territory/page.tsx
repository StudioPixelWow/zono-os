// ============================================================================
// 🗺️ ZONO — Territory Intelligence OS page (/territory). 39.0.
// Unifying command center composing the EXISTING territory engines
// (market-domination, street-building-intel, market heatmap). Cached read-only;
// approval-gated CTAs; no new engine, no schema.
// ============================================================================
import { getTerritoryOS } from "@/lib/territory-os/service";
import { TerritoryOS } from "@/components/territory-os/TerritoryOS";

export const dynamic = "force-dynamic";

export default async function TerritoryPage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  const { city } = await searchParams;
  const data = await getTerritoryOS(city);
  return <TerritoryOS data={data} />;
}
