// ============================================================================
// 🏘️ ZONO — Inventory Acquisition · Street & Building Intelligence page. 34.1.
// The missing finer-granularity recruitment view, feeding the existing
// acquisition / seller-intelligence engine. No new scoring, no new tables.
// ============================================================================
import { StreetBuildingIntel } from "@/components/acquisition/StreetBuildingIntel";

export const dynamic = "force-dynamic";

export default async function StreetsPage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  const { city } = await searchParams;
  return <StreetBuildingIntel city={city} />;
}
