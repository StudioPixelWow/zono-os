// 🗺️ /neighborhood-intelligence/dashboard — Neighborhood Dashboard (presentation only).
import { getIntelligenceExplorer } from "@/lib/intelligence-explorer/service";
import { NeighborhoodDashboardView } from "./NeighborhoodDashboardView";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export default async function NeighborhoodDashboardPage() {
  const data = await getIntelligenceExplorer();
  return <NeighborhoodDashboardView neighborhoods={data.neighborhoods} />;
}
