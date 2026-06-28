// ============================================================================
// 🗺️ /market-intelligence/map — Live Market Intelligence Map™ (flagship).
// Presentation only: visualizes existing geocoded intelligence on the existing
// MapLibre map with a toggleable layer system, Zone Explorer drawer and live
// feed. No recompute, no fake coordinates.
// ============================================================================
import { getMapIntelligence } from "@/lib/intelligence-explorer/map";
import { LiveMarketMapView } from "./LiveMarketMapView";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export default async function LiveMarketMapPage() {
  const data = await getMapIntelligence();
  return <LiveMarketMapView data={data} />;
}
